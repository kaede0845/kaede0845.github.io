// config.json の代わり。ここだけ編集すればOK
window.CFG = {
  // Google Cloud で作った APIキー(Drive API有効化・HTTPリファラ制限推奨)
  apiKey: 'AIzaSyBIpoa41DGs0q9JbMCxxITTFL-lbO0JXWQ',
  // 参照するDriveフォルダ(IDまたはURL)。共有設定は「リンクを知っている全員(閲覧者)」。series: true=漫画1作品 / false=本棚 / 省略=自動判定
  folders: [
    { id: 'https://drive.google.com/drive/folders/1ATVQ3U_hFTabMpn5LwyqvvZzHQxeV_oi', name: 'ダークギャザリング'},
  ],
  // 漫画名(フォルダ名またはID) → { volume: 巻番号, page: ページ番号または "50%" }
  anime_start: {
    'darkgathering': { volume: 9, page: 147 },
  },
  default_direction: 'rtl',   // 'rtl' | 'ltr'
  default_mode: 'scroll',     // 'single' | 'two' | 'scroll'
  cache_seconds: 300,
  announce_limit: 5,
  image_size: 's0'            // 's0'=原寸 / 'w2000' など
};
