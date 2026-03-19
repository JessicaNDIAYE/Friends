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
let editingPostId      = null;
let followedUsers      = JSON.parse(localStorage.getItem('paperwall_following') || '[]');
let cachedJournalPosts = [];
let activeJournalDay   = null;

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

// Composer title
const composerTitle    = document.getElementById('composer-title');

// Friends
const friendsSection   = document.getElementById('friends-section');
const friendSearchInput= document.getElementById('friend-search-input');
const friendSearchBtn  = document.getElementById('friend-search-btn');
const friendsContent   = document.getElementById('friends-content');

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

/* ─── Build right-side day tabs (from journal entries) ── */
function initSideTabs() {
  sideTabsEl.innerHTML = ''; // populated by buildDayTabs after journal loads
}

function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function buildDayTabs(posts) {
  sideTabsEl.innerHTML = '';
  if (!posts?.length) return;

  // Collect unique days
  const seen = new Map();
  posts.forEach(post => {
    const k = dayKey(post.created_at);
    if (!seen.has(k)) seen.set(k, new Date(post.created_at));
  });

  const todayKey = dayKey(new Date());

  [...seen.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .forEach(([k, d]) => {
      const tab = document.createElement('div');
      tab.className = 'side-tab day-tab';
      tab.dataset.dayKey = k;
      tab.textContent   = `${d.getDate()} ${MONTHS[d.getMonth()]}`;
      if (k === todayKey)        tab.classList.add('current');
      if (k === activeJournalDay) tab.classList.add('active-day');

      tab.addEventListener('click', () => {
        // Switch to journal if needed
        if (activeTab !== 'journal') {
          const journalBtn = document.querySelector('.bottom-tab[data-tab="journal"]');
          bottomTabs.forEach(t => t.classList.remove('active'));
          journalBtn.classList.add('active');
          activeTab = 'journal';
          feedSection.classList.remove('active');
          journalSection.classList.add('active');
          friendsSection.classList.remove('active');
        }
        filterJournalByDay(k, tab);
      });

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
    friendsSection.classList.toggle('active', activeTab === 'friends');
    if (activeTab === 'journal') loadJournal();
    if (activeTab === 'friends') loadFriendsFeed();
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
  editingPostId = null;
  composerTitle.textContent = 'new page';
  submitPostBtn.textContent = 'PIN IT ✦';
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
  submitPostBtn.textContent = editingPostId ? 'UPDATING...' : 'PINNING...';

  try {
    if (editingPostId) {
      const updateData = { content, is_private: isPrivateToggle.checked };
      if (selectedFile) updateData.image_url = await uploadImage(selectedFile);
      const { error } = await sb.from(TABLE)
        .update(updateData)
        .eq('id', editingPostId)
        .eq('user_id', currentUser.id);
      if (error) throw error;
    } else {
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
    }

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
    submitPostBtn.textContent = editingPostId ? 'UPDATE ✦' : 'PIN IT ✦';
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

  cachedJournalPosts = data || [];
  buildDayTabs(cachedJournalPosts);

  if (activeJournalDay) {
    const filtered = cachedJournalPosts.filter(p => dayKey(p.created_at) === activeJournalDay);
    renderJournalByDay(filtered);
  } else {
    renderJournalByDay(cachedJournalPosts);
  }
}

/* ═══════════════════════════════════════════════════════
   RENDER JOURNAL — grouped by day
═══════════════════════════════════════════════════════ */
function renderJournalByDay(posts) {
  journalPostsEl.innerHTML = '';

  if (!posts?.length) {
    const msg = activeJournalDay
      ? 'no notes for this day ✦'
      : 'nothing here yet...<br>this is your safe space ✦';
    journalPostsEl.innerHTML = `<div class="empty-card">${msg}</div>`;
    return;
  }

  // Group by day
  const dayMap = new Map();
  posts.forEach(post => {
    const k = dayKey(post.created_at);
    if (!dayMap.has(k)) dayMap.set(k, []);
    dayMap.get(k).push(post);
  });

  const dayNames   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const monthNames = ['january','february','march','april','may','june',
                      'july','august','september','october','november','december'];
  const todayKey   = dayKey(new Date());
  let   cardIndex  = 0;

  [...dayMap.keys()]
    .sort((a, b) => b.localeCompare(a))
    .forEach(k => {
      const d        = new Date(k + 'T12:00:00');
      const dayPosts = dayMap.get(k);
      const isToday  = k === todayKey;

      // Day header
      const header = document.createElement('div');
      header.className = 'journal-day-header' + (isToday ? ' today' : '');
      header.id = `day-${k}`;
      header.innerHTML = `
        <span class="jdh-day">${isToday ? 'today' : dayNames[d.getDay()]}</span>
        <span class="jdh-date">${monthNames[d.getMonth()]} ${d.getDate()}</span>
        <span class="jdh-count">${dayPosts.length}</span>
      `;
      journalPostsEl.appendChild(header);

      // Cards grid
      const grid = document.createElement('div');
      grid.className = 'masonry-grid';
      dayPosts.forEach(post => grid.appendChild(buildCard(post, cardIndex++, 'journal')));
      journalPostsEl.appendChild(grid);
    });
}

/* ═══════════════════════════════════════════════════════
   FILTER JOURNAL BY DAY
═══════════════════════════════════════════════════════ */
function filterJournalByDay(k, tabEl) {
  // Toggle off if same day clicked again
  if (activeJournalDay === k) {
    activeJournalDay = null;
    document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active-day'));
    renderJournalByDay(cachedJournalPosts);
    return;
  }
  activeJournalDay = k;
  document.querySelectorAll('.day-tab').forEach(t => t.classList.remove('active-day'));
  if (tabEl) tabEl.classList.add('active-day');

  const filtered = cachedJournalPosts.filter(p => dayKey(p.created_at) === k);
  renderJournalByDay(filtered);
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
    const card = buildCard(post, i, context);
    container.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════
   BUILD CARD
═══════════════════════════════════════════════════════ */
function buildCard(post, index, context = 'feed') {
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

  // Action buttons
  const actions = card.querySelector('.card-actions');
  const isOwn   = currentUser && post.user_id === currentUser.id;

  if (isOwn) {
    const editBtn = document.createElement('button');
    editBtn.className = 'card-action-btn edit-btn';
    editBtn.textContent = '✏️ edit';
    editBtn.addEventListener('click', e => { e.stopPropagation(); startEditPost(post); });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'card-action-btn delete-btn';
    deleteBtn.textContent = '🗑️ delete';
    deleteBtn.addEventListener('click', e => { e.stopPropagation(); deletePost(post.id); });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
  } else if (context === 'search' || context === 'friends') {
    const saveBtn = document.createElement('button');
    saveBtn.className = 'card-action-btn save-btn';
    saveBtn.textContent = '📌 save';
    saveBtn.addEventListener('click', e => { e.stopPropagation(); saveToJournal(post, saveBtn); });
    actions.appendChild(saveBtn);
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

/* ═══════════════════════════════════════════════════════
   EDIT POST
═══════════════════════════════════════════════════════ */
function startEditPost(post) {
  editingPostId = post.id;
  postContent.value = post.content;
  isPrivateToggle.checked = post.is_private;
  privacyLabelText.textContent = post.is_private ? 'private 🔒' : 'public 🌍';
  composerTitle.textContent = 'edit page';
  submitPostBtn.textContent = 'UPDATE ✦';
  if (post.image_url) {
    imagePreview.src = post.image_url;
    imagePreviewWrap.classList.remove('hidden');
  }
  composerOverlay.classList.remove('hidden');
  postContent.focus();
}

/* ═══════════════════════════════════════════════════════
   DELETE POST
═══════════════════════════════════════════════════════ */
async function deletePost(id) {
  if (!confirm('delete this post? this cannot be undone.')) return;
  const { error } = await sb.from(TABLE).delete().eq('id', id).eq('user_id', currentUser.id);
  if (!error) {
    await loadFeed();
    await loadJournal();
  }
}

/* ═══════════════════════════════════════════════════════
   SAVE TO PRIVATE JOURNAL
═══════════════════════════════════════════════════════ */
async function saveToJournal(post, btn) {
  btn.disabled = true;
  btn.textContent = 'saving...';
  const { error } = await sb.from(TABLE).insert({
    user_id:    currentUser.id,
    username:   currentUsername || currentUser.email,
    content:    `saved from ✦ ${post.username}:\n\n${post.content}`,
    image_url:  post.image_url || null,
    is_private: true,
  });
  if (!error) {
    btn.textContent = '✦ saved!';
    await loadJournal();
  } else {
    btn.disabled = false;
    btn.textContent = '📌 save';
  }
}

/* ═══════════════════════════════════════════════════════
   FOLLOW / UNFOLLOW
═══════════════════════════════════════════════════════ */
function toggleFollow(username) {
  const idx = followedUsers.indexOf(username);
  if (idx === -1) followedUsers.push(username);
  else followedUsers.splice(idx, 1);
  localStorage.setItem('paperwall_following', JSON.stringify(followedUsers));
}

/* ═══════════════════════════════════════════════════════
   FRIENDS — load followed users' posts
═══════════════════════════════════════════════════════ */
async function loadFriendsFeed() {
  if (!followedUsers.length) {
    friendsContent.innerHTML = `<div class="empty-card">search for someone and follow them<br>their posts will appear here ✦</div>`;
    return;
  }
  friendsContent.innerHTML = '<div class="loading-card">loading...</div>';
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .in('username', followedUsers)
    .eq('is_private', false)
    .order('created_at', { ascending: false });
  if (error) {
    friendsContent.innerHTML = `<div class="empty-card">couldn't load posts 😕</div>`;
    return;
  }
  if (!data?.length) {
    friendsContent.innerHTML = `<div class="empty-card">no posts from people you follow yet ✦</div>`;
    return;
  }
  const grid = document.createElement('div');
  grid.className = 'masonry-grid';
  data.forEach((post, i) => grid.appendChild(buildCard(post, i, 'friends')));
  friendsContent.innerHTML = '';
  friendsContent.appendChild(grid);
}

/* ═══════════════════════════════════════════════════════
   FRIENDS — search by username
═══════════════════════════════════════════════════════ */
async function searchFriends() {
  const query = friendSearchInput.value.trim();
  if (!query) { loadFriendsFeed(); return; }

  friendsContent.innerHTML = '<div class="loading-card">searching...</div>';
  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .ilike('username', `%${query}%`)
    .eq('is_private', false)
    .order('created_at', { ascending: false });

  if (error || !data?.length) {
    friendsContent.innerHTML = `<div class="empty-card">no one found for "${query}" ✦</div>`;
    return;
  }

  // Group posts by username
  const byUser = {};
  data.forEach(post => {
    if (!byUser[post.username]) byUser[post.username] = [];
    byUser[post.username].push(post);
  });

  friendsContent.innerHTML = '';
  Object.entries(byUser).forEach(([username, posts]) => {
    const isFollowing = followedUsers.includes(username);

    const header = document.createElement('div');
    header.className = 'friend-user-header';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'friend-user-name';
    nameSpan.textContent = `✦ ${username}`;

    const followBtn = document.createElement('button');
    followBtn.className = 'follow-btn' + (isFollowing ? ' following' : '');
    followBtn.textContent = isFollowing ? 'following ✓' : 'follow +';
    followBtn.addEventListener('click', () => {
      toggleFollow(username);
      const nowFollowing = followedUsers.includes(username);
      followBtn.textContent = nowFollowing ? 'following ✓' : 'follow +';
      followBtn.classList.toggle('following', nowFollowing);
    });

    header.appendChild(nameSpan);
    header.appendChild(followBtn);
    friendsContent.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'masonry-grid';
    posts.slice(0, 4).forEach((post, i) => grid.appendChild(buildCard(post, i, 'search')));
    friendsContent.appendChild(grid);
  });
}

friendSearchBtn.addEventListener('click', searchFriends);
friendSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') searchFriends(); });
