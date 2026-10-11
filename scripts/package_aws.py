"""Build a portable AWS release after running npm run build in frontend/."""
from pathlib import Path
import shutil
import subprocess
import sys
import uuid
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DIST = ROOT / 'frontend' / 'dist'
if not (DIST / 'index.html').exists():
    raise SystemExit('Build frontend first: cd frontend && npm ci && npm run build')
work = ROOT / '.build' / uuid.uuid4().hex
packages = work / 'lambda'
packages.mkdir(parents=True)
subprocess.run([
    sys.executable, '-m', 'pip', 'install', '--index-url', 'https://pypi.org/simple',
    '--platform', 'manylinux2014_x86_64', '--implementation', 'cp', '--python-version', '3.12',
    '--only-binary=:all:', '--target', str(packages),
    '-r', str(ROOT / 'backend' / 'requirements-lambda.txt'),
], check=True)
backend = packages / 'backend'
backend.mkdir()
for name in ['main.py', 'lambda_handler.py']:
    shutil.copy2(ROOT / 'backend' / name, backend / name)
release = work / 'release'
release.mkdir()
with zipfile.ZipFile(release / 'lambda.zip', 'w', zipfile.ZIP_DEFLATED) as archive:
    for file in packages.rglob('*'):
        if file.is_file() and '__pycache__' not in file.parts and file.suffix != '.pyc':
            archive.write(file, file.relative_to(packages).as_posix())
shutil.copytree(DIST, release / 'site')
for name in ['template.yaml', 'deploy.sh']:
    # CloudShell bash expects LF line endings, independent of the packaging host.
    content = (ROOT / 'infrastructure' / name).read_text(encoding='utf-8-sig')
    (release / name).write_bytes(content.replace('\r\n', '\n').encode('utf-8'))
output = ROOT / 'artifacts'
output.mkdir(exist_ok=True)
shutil.make_archive(str(output / 'clean-air-aws-release'), 'zip', release)
print(output / 'clean-air-aws-release.zip')
