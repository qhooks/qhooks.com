import unittest,tempfile,importlib.util,json
from pathlib import Path
spec=importlib.util.spec_from_file_location('manifest',Path(__file__).with_name('release-manifest.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Integrity(unittest.TestCase):
 def setUp(self):self.t=tempfile.TemporaryDirectory();self.root=Path(self.t.name);(self.root/'a.mjs').write_text('export const a=1;')
 def tearDown(self):self.t.cleanup()
 def test_identical_staging_and_bundle_included(self):
  (self.root/'b').mkdir();(self.root/'b/chunk.js').write_text('public bundle');v=m.build(self.root,'release');self.assertIn('b/chunk.js',v['files']);self.assertTrue(m.verify(self.root,v)['pass'])
 def test_changed_bytes_rejected(self):
  v=m.build(self.root,'release');(self.root/'a.mjs').write_text('changed');self.assertRaises(ValueError,m.verify,self.root,v)
 def test_removed_file_rejected(self):
  v=m.build(self.root,'release');(self.root/'a.mjs').unlink();self.assertRaises(ValueError,m.verify,self.root,v)
 def test_new_public_file_rejected(self):
  v=m.build(self.root,'release');(self.root/'new.mjs').write_text('new');self.assertRaises(ValueError,m.verify,self.root,v)
 def test_licensed_files_and_repo_metadata_excluded(self):
  for n in ['charting_library/a.js','datafeeds/udf/a.js','download/library.zip','.git/config']:
   p=self.root/n;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('excluded')
  self.assertEqual(set(m.build(self.root,'release')['files']),{'a.mjs'})
 def test_subset_never_claims_full_and_traversal_refused(self):
  v=m.build(self.root,'release',['a.mjs']);self.assertEqual(v['scope'],'subset');self.assertRaises(ValueError,m.verify,self.root,v);self.assertTrue(m.verify(self.root,v,False)['pass']);self.assertRaises(ValueError,m.build,self.root,'release',['../private'])
 def test_symlink_refused(self):
  (self.root/'link.js').symlink_to(self.root/'a.mjs');self.assertRaises(ValueError,m.build,self.root,'release')
 def test_symlink_directory_refused(self):
  (self.root/'nested').mkdir();(self.root/'nested/file.js').write_text('visible');(self.root/'alias').symlink_to(self.root/'nested',target_is_directory=True);self.assertRaises(ValueError,m.build,self.root,'release')
if __name__=='__main__':unittest.main()
