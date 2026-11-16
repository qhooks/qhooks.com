import unittest,tempfile,subprocess,hashlib,json,shutil
from pathlib import Path
class LicenseBoundary(unittest.TestCase):
 def fixture(self):
  temp=tempfile.TemporaryDirectory();root=Path(temp.name);(root/'.ci').mkdir();(root/'b').mkdir()
  for name in ['mirror-guard.sh','lwc-bundle-allow.py']:shutil.copyfile(Path(__file__).with_name(name),root/'.ci'/name)
  license=root/'LICENSE.fixture';license.write_text('Existing Apache License 2.0 fixture')
  body='x'*110000+'https://www.tradingview.com/?utm_medium=lwc-link&utm_campaign=lwc-chart title="Charting by TradingView"'
  file=root/'b/own.js';file.write_text(body)
  policy={'license':{'path':license.name,'sha256':hashlib.sha256(license.read_bytes()).hexdigest()},'bundles':{'b/own.js':hashlib.sha256(file.read_bytes()).hexdigest()}}
  (root/'.ci/lwc-bundle-allowlist.json').write_text(json.dumps(policy));return temp,root,file
 def guard(self,root):return subprocess.run(['sh',str(root/'.ci/mirror-guard.sh'),str(root)],capture_output=True,text=True)
 def test_pinned_lwc_attribution_allowed(self):
  t,r,f=self.fixture()
  with t:self.assertEqual(self.guard(r).returncode,0)
 def test_changed_or_unknown_bundle_refused(self):
  t,r,f=self.fixture()
  with t:
   f.write_text(f.read_text()+'modified');self.assertNotEqual(self.guard(r).returncode,0)
 def test_advanced_chart_paths_refused_even_with_allowed_lwc_bundle(self):
  t,r,f=self.fixture()
  with t:
   (r/'charting_library').mkdir();(r/'charting_library/library.js').write_text('licensed');self.assertNotEqual(self.guard(r).returncode,0)
if __name__=='__main__':unittest.main()
