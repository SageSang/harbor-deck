"""Verify actual release ZIPs, including the store/unpacked identity boundary."""
import base64
import hashlib
import json
import os
import re
from pathlib import Path
import zipfile

root = Path(__file__).resolve().parents[2]
identities = json.loads((root / 'shared/extension-identities.json').read_text())
version = os.environ.get('RELEASE_VERSION') or json.loads((root / 'package.json').read_text())['version']
tag = os.environ.get('RELEASE_TAG') or f'v{version}'

for channel, suffix in [('chrome', ''), ('edge', '-edge')]:
    stem = root / 'extension' / f'harbor-deck-{tag}{suffix}'
    with zipfile.ZipFile(f'{stem}.zip') as unpacked, zipfile.ZipFile(f'{stem}-store.zip') as store:
        names = {name for name in unpacked.namelist() if not name.endswith('/')}
        store_names = {name for name in store.namelist() if not name.endswith('/')}
        assert names == store_names, f'{channel}: package file lists differ'
        assert not any('@eaDir' in name.split('/') or '..' in name.split('/') or name.startswith('/') for name in names)
        manifest = json.loads(unpacked.read('manifest.json'))
        store_manifest = json.loads(store.read('manifest.json'))
        assert manifest['manifest_version'] == store_manifest['manifest_version'] == 3
        assert manifest['version'] == store_manifest['version'] == version
        assert manifest['key'] == identities[channel]['publicKey']
        digest = hashlib.sha256(base64.b64decode(manifest['key'], validate=True)).hexdigest()[:32]
        extension_id = ''.join(chr(ord('a') + int(char, 16)) for char in digest)
        assert extension_id == identities[channel]['id']
        assert 'key' not in store_manifest, f'{channel}: store ZIP must not contain manifest.key'
        assert {**store_manifest, 'key': manifest['key']} == manifest
        assert not manifest.get('host_permissions'), f'{channel}: unexpected fixed host permissions'
        for name in names - {'manifest.json'}:
            assert unpacked.read(name) == store.read(name), f'{channel}: unexpected difference in {name}'
        required = ['newtab.html', manifest['background']['service_worker'], manifest['action']['default_popup'],
                    manifest['options_ui']['page'], *manifest['chrome_url_overrides'].values(),
                    *manifest['icons'].values()]
        assert all(name in names for name in required), f'{channel}: missing manifest resource'
        for name in names:
            if name.endswith('.html'):
                for script in re.findall(r'<script\b[^>]*\bsrc="([^"]+)"', unpacked.read(name).decode()):
                    assert script.removeprefix('./') in names, f'{channel}: missing script {script}'
    print(f'{channel}: store ZIP has no key; unpacked ID {extension_id}; other files identical')
