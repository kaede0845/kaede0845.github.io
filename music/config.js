window.CFG = {
  // Google Cloud で作った APIキー(Drive API有効化・HTTPリファラ制限推奨)
  apiKey: 'AIzaSyBIpoa41DGs0q9JbMCxxITTFL-lbO0JXWQ',
  // 参照するDriveフォルダ(IDまたはURL)。共有設定は「リンクを知っている全員(閲覧者)」
  folders: [
    { id: 'https://drive.google.com/drive/folders/YOUR_MUSIC_FOLDER_ID', name: 'コンパス音楽ライブラリ'}
  ],
  cache_seconds: 300
};