#!/usr/bin/env bash
# Run from an extracted release in AWS CloudShell, or any authenticated AWS CLI shell.
set -euo pipefail
cd "$(dirname "$0")"
region="${1:-ap-south-1}"
stack="${2:-clean-air-hackathon}"
if [[ ! "$stack" =~ ^[a-z][a-z0-9-]{0,40}$ ]]; then
  echo "Use a lowercase stack name starting with a letter (max 41 characters)." >&2
  exit 1
fi
export AWS_DEFAULT_REGION="$region"
export AWS_PAGER=""
account="$(aws sts get-caller-identity --query Account --output text)"
bucket="${stack}-artifacts-${account}-${region}"
echo "Deploying ${stack} in account ${account}, region ${region}"
aws cloudformation validate-template --template-body file://template.yaml > /dev/null
if ! aws s3api head-bucket --bucket "$bucket" 2>/dev/null; then
  if [[ "$region" == "us-east-1" ]]; then
    aws s3api create-bucket --bucket "$bucket" --region "$region"
  else
    aws s3api create-bucket --bucket "$bucket" --region "$region" --create-bucket-configuration "LocationConstraint=${region}"
  fi
fi
aws s3api put-public-access-block --bucket "$bucket" --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
key="releases/$(sha256sum lambda.zip | cut -d ' ' -f 1).zip"
aws s3 cp lambda.zip "s3://${bucket}/${key}" --only-show-errors
aws cloudformation deploy --stack-name "$stack" --template-file template.yaml \
  --parameter-overrides "ArtifactBucket=${bucket}" "ArtifactKey=${key}" \
  --capabilities CAPABILITY_IAM --no-fail-on-empty-changeset \
  --tags Project=CleanAirNavigation Purpose=EnvironmentalHackathon
output() { aws cloudformation describe-stacks --stack-name "$stack" --query "Stacks[0].Outputs[?OutputKey=='$1'].OutputValue | [0]" --output text; }
site_bucket="$(output SiteBucketName)"
distribution="$(output DistributionId)"
site_url="$(output SiteUrl)"
# Fingerprinted assets can be cached for a year. Upload HTML last; keep prior
# fingerprinted assets so open browser tabs continue to work during updates.
aws s3 cp site/ "s3://${site_bucket}/" --recursive --exclude index.html --cache-control 'public,max-age=31536000,immutable' --only-show-errors
aws s3 cp site/index.html "s3://${site_bucket}/index.html" --cache-control 'public,max-age=60,must-revalidate' --content-type 'text/html; charset=utf-8' --only-show-errors
invalidation="$(aws cloudfront create-invalidation --distribution-id "$distribution" --paths '/' '/index.html' --query Invalidation.Id --output text)"
aws cloudfront wait invalidation-completed --distribution-id "$distribution" --id "$invalidation"
curl --fail --retry 5 --retry-delay 5 "${site_url}/health"
curl --fail --silent --show-error "${site_url}/api/v1/route?start=Koramangala&end=Whitefield" | python3 -c 'import json,sys; d=json.load(sys.stdin); assert d["clean_route"]["path"][0]=="Koramangala"; print("Route API verified")'
curl --fail --silent --show-error "${site_url}/" | python3 -c 'import sys; assert "id=\"root\"" in sys.stdin.read(); print("Frontend verified")'
echo "Deployment complete: ${site_url}"
