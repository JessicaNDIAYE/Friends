/* ═══════════════════════════════════════════════════════
   PaperWall — script.js
   Stack: Vanilla JS + Supabase JS v2
═══════════════════════════════════════════════════════ */

const SUPABASE_URL      = 'https://tvklioergzytwupzxfyi.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2a2xpb2VyZ3p5dHd1cHp4ZnlpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTIzMzk4ODcsImV4cCI6MjA2NzkxNTg4N30.QPoyB7azRnmpTiWorldeYP3UeEMv1gehQ3Auhc5ijF4';

const TABLE  = 'paperwall_posts';
const BUCKET = 'paperwall-images';

/* ── Card color cycle (matches the planner palette) ── */
const CARD_THEMES = ['card-navy', 'card-yellow', 'card-blue', 'card-cream', 'card-teal'];

/* ── Month names for side tabs ─────────────────────── */
const MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

/* ═══════════════════════════════════════════════════════
   INIT SUPABASE
═══════════════════════════════════════════════════════ */
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
let currentUser     = null;
let currentUsername = null;
let selectedFile    = null;
let activeTab       = 'feed';

/* ═══════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════ */
const authScreen       = document.getElementById('auth-screen');
const appEl            = document.getElementById('app');
const topbarUsername   = document.getElementById('topbar-username');
const logoutBtn        = document.getElementById('logout-btn');

// Auth
const loginForm        = document.getElementById('login-form');
const signupForm       = document.getElementById('signup-form');
const loginEmail       = document.getElementById('login-email');
const loginPassword    = document.getElementById('login-password');
const loginError       = document.getElementById('login-error');
const signupEmail      = document.getElementById('signup-email');
const signupPassword   = document.getElementById('signup-password');
const signupUsername   = document.getElementById('signup-username');
const signupError      = document.getElementById('signup-error');
const signupSuccess    = document.getElementById('signup-success');
const authTabs         = document.querySelectorAll('.auth-tab');

// Composer
const composerOverlay  = document.getElementById('composer-overlay');
const composerClose    = document.getElementById('composer-close');
const composeTrigger   = document.getElementById('compose-trigger');
const postContent      = document.getElementById('post-content');
const postImage        = document.getElementById('post-image');
const imagePreviewWrap = document.getElementById('image-preview-wrap');
const imagePreview     = document.getElementById('image-preview');
const removeImageBtn   = document.getElementById('remove-image');
const submitPostBtn    = document.getElementById('submit-post');
const isPrivateToggle  = document.getElementById('is-private-toggle');
const privacyLabelText = document.getElementById('privacy-label-text');
const postError        = document.getElementById('post-error');

// Nav
const bottomTabs       = document.querySelectorAll('.bottom-tab[data-tab]');
const feedSection      = document.getElementById('feed-section');
const journalSection   = document.getElementById('journal-section');
const feedPostsEl      = document.getElementById('feed-posts');
const journalPostsEl   = document.getElementById('journal-posts');
const sideTabsEl       = document.getElementById('side-tabs');

// Card template
const cardTemplate     = document.getElementById('post-card-template');

/* ═══════════════════════════════════════════════════════
   BOOT
═══════════════════════════════════════════════════════ */
(async () => {
  initHeader();
  initSideTabs();

  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadUsername();
    showApp();
  } else {
    showAuth();
  }

  sb.auth.onAuthStateChange(async (_event, session) => {
    if (session) {
      currentUser = session.user;
      await loadUsername();
      showApp();
    } else {
      currentUser = null;
      currentUsername = null;
      showAuth();
    }
  });
})();

/* ─── Initialize header date ────────────────────────── */
function initHeader() {
  const now   = new Date();
  const days  = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months= ['january','february','march','april','may','june',
                 'july','august','september','october','november','december'];
  document.getElementById('header-day').textContent  = days[now.getDay()];
  document.getElementById('header-date').textContent =
    `${months[now.getMonth()]} ${now.getDate()}`;
}

/* ─── Build right-side month tabs ───────────────────── */
function initSideTabs() {
  const currentMonth = new Date().getMonth();
  MONTHS.forEach((m, i) => {
    const tab = document.createElement('div');
    tab.className = 'side-tab' + (i === currentMonth ? ' current' : '');
    tab.textContent = m;
    sideTabsEl.appendChild(tab);
  });
}

/* ═══════════════════════════════════════════════════════
   SHOW / HIDE SCREENS
═══════════════════════════════════════════════════════ */
function showAuth() {
  authScreen.classList.remove('hidden');
  appEl.classList.add('hidden');
}

function showApp() {
  authScreen.classList.add('hidden');
  appEl.classList.remove('hidden');
  topbarUsername.textContent = currentUsername || currentUser.email;
  loadFeed();
  loadJournal();
}

async function loadUsername() {
  const meta = currentUser.user_metadata;
  if (meta?.username) { currentUsername = meta.username; return; }
  const { data } = await sb.from(TABLE).select('username').eq('user_id', currentUser.id).limit(1);
  if (data?.length) currentUsername = data[0].username;
}

/* ═══════════════════════════════════════════════════════
   AUTH — tab switching
═══════════════════════════════════════════════════════ */
authTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    authTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const target = tab.dataset.tab;
    loginForm.classList.toggle('active', target === 'login');
    signupForm.classList.toggle('active', target === 'signup');
    loginError.textContent = signupError.textContent = signupSuccess.textContent = '';
  });
});

/* ═══════════════════════════════════════════════════════
   AUTH — login
═══════════════════════════════════════════════════════ */
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';
  const btn = loginForm.querySelector('.btn-pill');
  btn.disabled = true;
  btn.textContent = 'OPENING...';

  const { error } = await sb.auth.signInWithPassword({
    email: loginEmail.value.trim(),
    password: loginPassword.value,
  });

  if (error) {
    loginError.textContent = error.message;
    btn.disabled = false;
    btn.textContent = 'OPEN MY JOURNAL →';
  }
});

/* ═══════════════════════════════════════════════════════
   AUTH — sign up
═══════════════════════════════════════════════════════ */
signupForm.addEventListener('submit', async e => {
  e.preventDefault();
  signupError.textContent = signupSuccess.textContent = '';
  const btn = signupForm.querySelector('.btn-pill');
  btn.disabled = true;
  btn.textContent = 'CREATING...';

  const username = signupUsername.value.trim();
  if (!username) {
    signupError.textContent = 'please enter a username';
    btn.disabled = false;
    btn.textContent = 'START MY JOURNAL →';
    return;
  }

  const { error } = await sb.auth.signUp({
    email:    signupEmail.value.trim(),
    password: signupPassword.value,
    options:  { data: { username } },
  });

  btn.disabled = false;
  btn.textContent = 'START MY JOURNAL →';

  if (error) {
    signupError.textContent = error.message;
  } else {
    signupSuccess.textContent = 'check your email to confirm your account ✦';
    signupForm.reset();
  }
});

/* ═══════════════════════════════════════════════════════
   LOGOUT
═══════════════════════════════════════════════════════ */
logoutBtn.addEventListener('click', () => sb.auth.signOut());

/* ═══════════════════════════════════════════════════════
   BOTTOM NAV TABS
═══════════════════════════════════════════════════════ */
bottomTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    bottomTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;
    feedSection.classList.toggle('active', activeTab === 'feed');
    journalSection.classList.toggle('active', activeTab === 'journal');
  });
});

/* ═══════════════════════════════════════════════════════
   COMPOSER MODAL
═══════════════════════════════════════════════════════ */
composeTrigger.addEventListener('click', () => {
  composerOverlay.classList.remove('hidden');
  postContent.focus();
});

composerClose.addEventListener('click', closeComposer);

composerOverlay.addEventListener('click', e => {
  if (e.target === composerOverlay) closeComposer();
});

function closeComposer() {
  composerOverlay.classList.add('hidden');
}

/* ═══════════════════════════════════════════════════════
   PRIVACY TOGGLE
═══════════════════════════════════════════════════════ */
isPrivateToggle.addEventListener('change', () => {
  privacyLabelText.textContent = isPrivateToggle.checked ? 'private 🔒' : 'public 🌍';
});

/* ═══════════════════════════════════════════════════════
   IMAGE PREVIEW
═══════════════════════════════════════════════════════ */
postImage.addEventListener('change', () => {
  const file = postImage.files[0];
  if (!file) return;
  selectedFile = file;
  const reader = new FileReader();
  reader.onload = e => {
    imagePreview.src = e.target.result;
    imagePreviewWrap.classList.remove('hidden');
  };
  reader.readAsDataURL(file);
});

removeImageBtn.addEventListener('click', () => {
  selectedFile = null;
  postImage.value = '';
  imagePreview.src = '';
  imagePreviewWrap.classList.add('hidden');
});

/* ═══════════════════════════════════════════════════════
   SUBMIT POST
═══════════════════════════════════════════════════════ */
submitPostBtn.addEventListener('click', async () => {
  postError.textContent = '';
  const content = postContent.value.trim();
  if (!content) {
    postError.textContent = 'write something first ✦';
    return;
  }

  submitPostBtn.disabled = true;
  submitPostBtn.textContent = 'PINNING...';

  try {
    let imageUrl = null;
    if (selectedFile) imageUrl = await uploadImage(selectedFile);

    const { error } = await sb.from(TABLE).insert({
      user_id:    currentUser.id,
      username:   currentUsername || currentUser.email,
      content,
      image_url:  imageUrl,
      is_private: isPrivateToggle.checked,
    });

    if (error) throw error;

    // Reset composer
    postContent.value = '';
    selectedFile = null;
    postImage.value = '';
    imagePreview.src = '';
    imagePreviewWrap.classList.add('hidden');
    isPrivateToggle.checked = false;
    privacyLabelText.textContent = 'public 🌍';
    closeComposer();

    // Reload data
    await loadFeed();
    await loadJournal();

  } catch (err) {
    postError.textContent = err.message || 'something went wrong';
  } finally {
    submitPostBtn.disabled = false;
    submitPostBtn.textContent = 'PIN IT ✦';
  }
});

/* ═══════════════════════════════════════════════════════
   IMAGE UPLOAD
═══════════════════════════════════════════════════════ */
async function uploadImage(file) {
  const ext      = file.name.split('.').pop();
  const filename = `${currentUser.id}/${Date.now()}.${ext}`;

  const { error } = await sb.storage.from(BUCKET).upload(filename, file, { upsert: false });
  if (error) throw error;

  const { data } = sb.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

/* ═══════════════════════════════════════════════════════
   FETCH — public feed
═══════════════════════════════════════════════════════ */
async function loadFeed() {
  feedPostsEl.innerHTML = '<div class="loading-card">loading pages...</div>';

  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .eq('is_private', false)
    .order('created_at', { ascending: false });

  if (error) {
    feedPostsEl.innerHTML = `<div class="empty-card">couldn't load posts 😕</div>`;
    return;
  }

  renderPosts(feedPostsEl, data, 'feed');
}

/* ═══════════════════════════════════════════════════════
   FETCH — private journal
═══════════════════════════════════════════════════════ */
async function loadJournal() {
  if (!currentUser) return;
  journalPostsEl.innerHTML = '<div class="loading-card">loading your entries...</div>';

  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('is_private', true)
    .order('created_at', { ascending: false });

  if (error) {
    journalPostsEl.innerHTML = `<div class="empty-card">couldn't load journal 😕</div>`;
    return;
  }

  renderPosts(journalPostsEl, data, 'journal');
}

/* ═══════════════════════════════════════════════════════
   RENDER POSTS
═══════════════════════════════════════════════════════ */
function renderPosts(container, posts, context) {
  container.innerHTML = '';

  if (!posts?.length) {
    const msg = context === 'journal'
      ? 'nothing here yet...<br>this is your safe space ✦'
      : 'no posts yet — be the first ✦';
    container.innerHTML = `<div class="empty-card">${msg}</div>`;
    return;
  }

  posts.forEach((post, i) => {
    const card = buildCard(post, i);
    container.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════
   BUILD CARD
═══════════════════════════════════════════════════════ */
function buildCard(post, index) {
  const clone = cardTemplate.content.cloneNode(true);
  const card  = clone.querySelector('.post-card');

  // Assign color theme (cycle through palette)
  const theme = CARD_THEMES[index % CARD_THEMES.length];
  card.classList.add(theme);

  // Short posts (≤ 80 chars) get bold uppercase treatment
  if (post.content.trim().length <= 80) {
    card.dataset.short = 'true';
  }

  // Populate
  card.querySelector('.post-content-text').textContent = post.content;
  card.querySelector('.post-username').textContent      = `✦ ${post.username}`;
  card.querySelector('.post-date').textContent          = formatDate(post.created_at);

  // Image
  if (post.image_url) {
    const wrap = card.querySelector('.post-image-wrap');
    const img  = card.querySelector('.post-image');
    img.src = post.image_url;
    img.alt = `photo by ${post.username}`;
    wrap.classList.remove('hidden');
  }

  // Stagger animation
  card.style.animationDelay = `${index * 50}ms`;

  return clone;
}

/* ═══════════════════════════════════════════════════════
   DATE FORMATTING — journal style
   e.g. "Mar 18 · 9:41 pm"
═══════════════════════════════════════════════════════ */
function formatDate(isoString) {
  const d = new Date(isoString);
  const months = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const h    = d.getHours();
  const mins = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'pm' : 'am';
  const h12  = h % 12 || 12;
  return `${months[d.getMonth()]} ${d.getDate()} · ${h12}:${mins} ${ampm}`;
}
