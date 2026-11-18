import pathlib,shutil,subprocess,tempfile,unittest
ROOT=pathlib.Path(__file__).resolve().parent.parent
class ExactAuthoredSourceGuard(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);(self.root/'.ci').mkdir()
  for n in ['mirror-guard.sh','lwc-bundle-allow.py','lwc-bundle-allowlist.json']:shutil.copyfile(ROOT/'.ci'/n,self.root/'.ci'/n)
  shutil.copyfile(ROOT/'qx-terminal.mjs',self.root/'qx-terminal.mjs')
 def tearDown(self):self.tmp.cleanup()
 def check(self):return subprocess.run(['sh',str(self.root/'.ci/mirror-guard.sh'),str(self.root)],capture_output=True,text=True)
 def test_exact_owned_source_accepted(self):self.assertEqual(self.check().returncode,0)
 def test_modified_hash_refused(self):
  with (self.root/'qx-terminal.mjs').open('a') as f:f.write('\n// modified\n')
  self.assertNotEqual(self.check().returncode,0)
 def test_opaque_and_standalone_hard_bans_remain(self):
  # Synthetic path sentinels only: no actual opaque library content is accessed.
  for name in ['charting_library/opaque.js','datafeeds/udf/opaque.js','tradingview.opaque.js']:
   with self.subTest(path=name):
    p=self.root/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(b'path sentinel')
    self.assertNotEqual(self.check().returncode,0);p.unlink()
if __name__=='__main__':unittest.main()
