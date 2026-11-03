(async () => {
const D = await window.getPlayerData();
const $ = s => document.querySelector(s);
let currentIdx = D.start;
const audio = new Audio();
let isPlaying = false;
let isShuffle = false;
let isRepeat = false;

const loadTrack = (idx, autoPlay = true) => {
  if (idx < 0 || idx >= D.tracks.length) return;
  currentIdx = idx;
  const track = D.tracks[currentIdx];
  audio.src = track.src;
  $('#track-title').textContent = track.title;
  $('#album-title').textContent = D.title;
  $('#cnt').textContent = `${currentIdx + 1} / ${D.tracks.length}`;
  
  // プレイリストのアクティブ表示更新
  document.querySelectorAll('.playlist-item').forEach((el, i) => {
    el.classList.toggle('active', i === currentIdx);
  });

  // サムネイルの初期化（読み込み中はデフォルト表示）
  const thumbImg = $('#thumbnail-img');
  const defaultArt = $('#default-art');
  thumbImg.style.display = 'none';
  defaultArt.style.display = 'block';

  // 音楽ファイルからメタデータ（サムネイル）を取得
  if (window.jsmediatags) {
    window.jsmediatags.read(track.src, {
      onSuccess: function(tag) {
        const picture = tag.tags.picture;
        if (picture) {
          let base64String = "";
          for (let i = 0; i < picture.data.length; i++) {
            base64String += String.fromCharCode(picture.data[i]);
          }
          const base64 = window.btoa(base64String);
          thumbImg.src = `data:${picture.format};base64,${base64}`;
          thumbImg.style.display = 'block';
          defaultArt.style.display = 'none';
        }
      },
      onError: function(error) {
        console.log("No tags found or error:", error);
      }
    });
  }

  if (autoPlay) {
    audio.play().then(() => {
      isPlaying = true;
      updatePlayBtn();
    }).catch(e => console.log('Autoplay blocked:', e));
  }
};

const updatePlayBtn = () => {
  $('#play-pause').textContent = isPlaying ? '⏸ 一時停止' : '▶ 再生';
};

// プレイリスト描画
const renderPlaylist = () => {
  const html = D.tracks.map((t, i) => `
    <div class="playlist-item ${i === currentIdx ? 'active' : ''}" data-idx="${i}">
      <span>${i + 1}. ${t.title}</span>
    </div>
  `).join('');
  $('#playlist').innerHTML = html;
  
  document.querySelectorAll('.playlist-item').forEach(el => {
    el.onclick = () => {
      loadTrack(parseInt(el.dataset.idx));
    };
  });
};

/* イベントリスナー */
$('#play-pause').onclick = () => {
  if (!audio.src) { loadTrack(currentIdx); return; }
  if (isPlaying) {
    audio.pause();
    isPlaying = false;
  } else {
    audio.play();
    isPlaying = true;
  }
  updatePlayBtn();
};

$('#prev').onclick = () => {
  let nextIdx = currentIdx - 1;
  if (nextIdx < 0) nextIdx = D.tracks.length - 1;
  loadTrack(nextIdx);
};

$('#next').onclick = () => {
  let nextIdx = currentIdx + 1;
  if (isShuffle) {
    nextIdx = Math.floor(Math.random() * D.tracks.length);
  } else if (nextIdx >= D.tracks.length) {
    nextIdx = 0;
  }
  loadTrack(nextIdx);
};

$('#shuffle').onclick = () => {
  isShuffle = !isShuffle;
  $('#shuffle').classList.toggle('active', isShuffle);
};

$('#repeat').onclick = () => {
  isRepeat = !isRepeat;
  $('#repeat').classList.toggle('active', isRepeat);
};

audio.ontimeupdate = () => {
  if (!isNaN(audio.duration)) {
    $('#seek').value = (audio.currentTime / audio.duration) * 100;
    $('#current-time').textContent = formatTime(audio.currentTime);
    $('#duration').textContent = formatTime(audio.duration);
  }
};

audio.onended = () => {
  if (isRepeat) {
    audio.currentTime = 0;
    audio.play();
  } else {
    $('#next').click();
  }
};

$('#seek').oninput = e => {
  if (!isNaN(audio.duration)) {
    audio.currentTime = (e.target.value / 100) * audio.duration;
  }
};

$('#volume').oninput = e => {
  audio.volume = e.target.value;
};

function formatTime(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

// 初期化
$('#back').href = D.back;
renderPlaylist();
loadTrack(currentIdx, false);
})();