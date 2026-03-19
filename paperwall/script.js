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
let cachedFeedPosts    = [];
let activeJournalDay   = null;
let activeFeedDay      = null;
let calOpenMonth       = null;   // month index (0–11) whose calendar is open
let calYear            = new Date().getFullYear();

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

// Profile
const profileSection   = document.getElementById('profile-section');

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

/* ─── Month side tabs (click → calendar popup) ──────── */
function initSideTabs() {
  const currentMonth = new Date().getMonth();
  MONTHS.forEach((m, i) => {
    const tab = document.createElement('div');
    tab.className = 'side-tab' + (i === currentMonth ? ' current' : '');
    tab.textContent = m;
    tab.addEventListener('click', e => { e.stopPropagation(); toggleCalendar(i, tab); });
    sideTabsEl.appendChild(tab);
  });
}

/* ─── Day key helper ─────────────────────────────────── */
function dayKey(date) {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

/* ─── Calendar popup ─────────────────────────────────── */
function toggleCalendar(monthIndex, tabEl) {
  const popup = document.getElementById('calendar-popup');
  if (calOpenMonth === monthIndex && !popup.classList.contains('hidden')) {
    closeCalendar(); return;
  }
  calOpenMonth = monthIndex;
  calYear      = new Date().getFullYear();

  // Position popup vertically near the clicked tab
  const rect = tabEl.getBoundingClientRect();
  popup.style.top = `${Math.min(Math.max(rect.top, 60), window.innerHeight - 320)}px`;

  renderCalendar();
  popup.classList.remove('hidden');

  // Highlight the active month tab
  document.querySelectorAll('.side-tab').forEach((t, i) => {
    t.classList.toggle('cal-open', i === monthIndex);
  });
}

function closeCalendar() {
  document.getElementById('calendar-popup').classList.add('hidden');
  document.querySelectorAll('.side-tab').forEach(t => t.classList.remove('cal-open'));
  calOpenMonth = null;
}

function renderCalendar() {
  const popup = document.getElementById('calendar-popup');
  const MONTH_NAMES = ['January','February','March','April','May','June',
                       'July','August','September','October','November','December'];

  // Days in this month that have posts (context-aware)
  const postsForCal = activeTab === 'journal' ? cachedJournalPosts : cachedFeedPosts;
  const daysWithNotes = new Set(
    postsForCal
      .filter(p => {
        const d = new Date(p.created_at);
        return d.getMonth() === calOpenMonth && d.getFullYear() === calYear;
      })
      .map(p => new Date(p.created_at).getDate())
  );

  const firstWeekday = (new Date(calYear, calOpenMonth, 1).getDay() + 6) % 7; // Mon=0
  const daysInMonth  = new Date(calYear, calOpenMonth + 1, 0).getDate();
  const today        = new Date();
  const isThisMonth  = today.getMonth() === calOpenMonth && today.getFullYear() === calYear;

  // Build grid cells
  let cells = '';
  for (let i = 0; i < firstWeekday; i++) cells += `<span class="cal-cell empty"></span>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const k     = `${calYear}-${String(calOpenMonth+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    let   cls   = 'cal-cell';
    const activeDay = activeTab === 'journal' ? activeJournalDay : activeFeedDay;
    if (daysWithNotes.has(d))             cls += ' has-notes';
    if (isThisMonth && d === today.getDate()) cls += ' today';
    if (k === activeDay)                  cls += ' selected';
    cells += `<span class="${cls}" data-key="${k}">${d}</span>`;
  }

  popup.innerHTML = `
    <div class="cal-header">
      <button class="cal-nav" id="cal-prev">‹</button>
      <span class="cal-title">${MONTH_NAMES[calOpenMonth]} ${calYear}</span>
      <button class="cal-nav" id="cal-next">›</button>
    </div>
    <div class="cal-weekdays">
      <span>Mo</span><span>Tu</span><span>We</span><span>Th</span><span>Fr</span><span>Sa</span><span>Su</span>
    </div>
    <div class="cal-days">${cells}</div>
  `;

  popup.querySelector('#cal-prev').addEventListener('click', e => {
    e.stopPropagation();
    calOpenMonth--; if (calOpenMonth < 0)  { calOpenMonth = 11; calYear--; }
    document.querySelectorAll('.side-tab').forEach((t, i) => {
      t.classList.toggle('cal-open', i === calOpenMonth && calYear === new Date().getFullYear());
      t.classList.toggle('current', i === new Date().getMonth() && calYear === new Date().getFullYear());
    });
    renderCalendar();
  });
  popup.querySelector('#cal-next').addEventListener('click', e => {
    e.stopPropagation();
    calOpenMonth++; if (calOpenMonth > 11) { calOpenMonth = 0;  calYear++; }
    document.querySelectorAll('.side-tab').forEach((t, i) => {
      t.classList.toggle('cal-open', i === calOpenMonth && calYear === new Date().getFullYear());
      t.classList.toggle('current', i === new Date().getMonth() && calYear === new Date().getFullYear());
    });
    renderCalendar();
  });

  popup.querySelectorAll('.cal-cell:not(.empty)').forEach(el => {
    el.addEventListener('click', e => {
      e.stopPropagation();
      const k = el.dataset.key;
      if (activeTab === 'journal') {
        filterJournalByDay(k);
      } else if (activeTab === 'feed') {
        filterFeedByDay(k);
      } else {
        // From friends tab — switch to journal and filter there
        document.querySelector('.bottom-tab[data-tab="journal"]').click();
        filterJournalByDay(k);
      }
      renderCalendar();
    });
  });
}

// Close calendar on outside click
document.addEventListener('click', e => {
  const popup = document.getElementById('calendar-popup');
  if (!popup.classList.contains('hidden') && !popup.contains(e.target)) {
    closeCalendar();
  }
});

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
    profileSection.classList.toggle('active', activeTab === 'profile');
    if (activeTab === 'journal') loadJournal();
    if (activeTab === 'friends') loadFriendsFeed();
    if (activeTab === 'profile') loadProfileSection();
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

  cachedFeedPosts = data || [];
  if (activeFeedDay) {
    renderPostsByDay(feedPostsEl, cachedFeedPosts.filter(p => dayKey(p.created_at) === activeFeedDay), 'feed');
  } else {
    renderPostsByDay(feedPostsEl, cachedFeedPosts, 'feed');
  }
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

  if (activeJournalDay) {
    renderPostsByDay(journalPostsEl, cachedJournalPosts.filter(p => dayKey(p.created_at) === activeJournalDay), 'journal');
  } else {
    renderPostsByDay(journalPostsEl, cachedJournalPosts, 'journal');
  }
}

/* ═══════════════════════════════════════════════════════
   RENDER POSTS — grouped by day (feed & journal)
═══════════════════════════════════════════════════════ */
function renderPostsByDay(container, posts, context) {
  container.innerHTML = '';
  const activeDay = context === 'feed' ? activeFeedDay : activeJournalDay;

  if (!posts?.length) {
    const msg = activeDay
      ? 'no posts for this day ✦'
      : context === 'journal'
        ? 'nothing here yet...<br>this is your safe space ✦'
        : 'no posts yet — be the first ✦';
    container.innerHTML = `<div class="empty-card">${msg}</div>`;
    return;
  }

  const dayMap     = new Map();
  const dayNames   = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
  const monthNames = ['january','february','march','april','may','june',
                      'july','august','september','october','november','december'];
  const todayKey   = dayKey(new Date());
  let   cardIndex  = 0;

  posts.forEach(post => {
    const k = dayKey(post.created_at);
    if (!dayMap.has(k)) dayMap.set(k, []);
    dayMap.get(k).push(post);
  });

  [...dayMap.keys()].sort((a, b) => b.localeCompare(a)).forEach(k => {
    const d        = new Date(k + 'T12:00:00');
    const dayPosts = dayMap.get(k);
    const isToday  = k === todayKey;

    const header = document.createElement('div');
    header.className = 'journal-day-header' + (isToday ? ' today' : '');
    header.innerHTML = `
      <span class="jdh-day">${isToday ? 'today' : dayNames[d.getDay()]}</span>
      <span class="jdh-date">${monthNames[d.getMonth()]} ${d.getDate()}</span>
      <span class="jdh-count">${dayPosts.length}</span>
    `;
    container.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'masonry-grid';
    dayPosts.forEach(post => grid.appendChild(buildCard(post, cardIndex++, context)));
    container.appendChild(grid);
  });
}

/* ═══════════════════════════════════════════════════════
   FILTER BY DAY — journal
═══════════════════════════════════════════════════════ */
function filterJournalByDay(k) {
  const btn = document.getElementById('qnav-all');
  if (activeJournalDay === k) {
    activeJournalDay = null;
    if (btn) btn.classList.add('hidden');
    renderPostsByDay(journalPostsEl, cachedJournalPosts, 'journal');
    return;
  }
  activeJournalDay = k;
  if (btn) btn.classList.remove('hidden');
  renderPostsByDay(journalPostsEl, cachedJournalPosts.filter(p => dayKey(p.created_at) === k), 'journal');
}

/* ═══════════════════════════════════════════════════════
   FILTER BY DAY — feed
═══════════════════════════════════════════════════════ */
function filterFeedByDay(k) {
  const btn = document.getElementById('feed-qnav-all');
  if (activeFeedDay === k) {
    activeFeedDay = null;
    if (btn) btn.classList.add('hidden');
    renderPostsByDay(feedPostsEl, cachedFeedPosts, 'feed');
    return;
  }
  activeFeedDay = k;
  if (btn) btn.classList.remove('hidden');
  renderPostsByDay(feedPostsEl, cachedFeedPosts.filter(p => dayKey(p.created_at) === k), 'feed');
}

/* ── Quick nav — journal ─────────────────────────────── */
document.getElementById('qnav-today').addEventListener('click', () => {
  filterJournalByDay(dayKey(new Date()));
  if (activeTab !== 'journal') document.querySelector('.bottom-tab[data-tab="journal"]').click();
});
document.getElementById('qnav-yesterday').addEventListener('click', () => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  filterJournalByDay(dayKey(d));
  if (activeTab !== 'journal') document.querySelector('.bottom-tab[data-tab="journal"]').click();
});
document.getElementById('qnav-all').addEventListener('click', () => {
  activeJournalDay = null;
  document.getElementById('qnav-all').classList.add('hidden');
  renderPostsByDay(journalPostsEl, cachedJournalPosts, 'journal');
  closeCalendar();
});

/* ── Quick nav — feed ───────────────────────────────── */
document.getElementById('feed-qnav-today').addEventListener('click', () => {
  filterFeedByDay(dayKey(new Date()));
});
document.getElementById('feed-qnav-yesterday').addEventListener('click', () => {
  const d = new Date(); d.setDate(d.getDate() - 1);
  filterFeedByDay(dayKey(d));
});
document.getElementById('feed-qnav-all').addEventListener('click', () => {
  activeFeedDay = null;
  document.getElementById('feed-qnav-all').classList.add('hidden');
  renderPostsByDay(feedPostsEl, cachedFeedPosts, 'feed');
  closeCalendar();
});

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

/* ═══════════════════════════════════════════════════════
   PROFILE SECTION
═══════════════════════════════════════════════════════ */
async function loadProfileSection() {
  // Avatar initial
  const initial = (currentUsername || currentUser.email || '?')[0].toUpperCase();
  profileSection.querySelector('.profile-avatar').textContent = initial;
  profileSection.querySelector('.profile-name').textContent   = '@' + (currentUsername || currentUser.email);
  profileSection.querySelector('.profile-email').textContent  = currentUser.email;
  document.getElementById('profile-username-input').placeholder = currentUsername || 'choose a username';

  // Post counts from DB
  const [{ count: pubCount }, { count: privCount }] = await Promise.all([
    sb.from(TABLE).select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id).eq('is_private', false),
    sb.from(TABLE).select('*', { count: 'exact', head: true }).eq('user_id', currentUser.id).eq('is_private', true),
  ]);
  document.getElementById('profile-stat-public').textContent    = pubCount ?? 0;
  document.getElementById('profile-stat-private').textContent   = privCount ?? 0;
  document.getElementById('profile-stat-following').textContent = followedUsers.length;

  renderProfileFollowing();
}

function renderProfileFollowing() {
  const list = document.getElementById('profile-following-list');
  document.getElementById('following-count').textContent = followedUsers.length;
  document.getElementById('profile-stat-following').textContent = followedUsers.length;

  if (!followedUsers.length) {
    list.innerHTML = '<p style="font-size:0.85rem;color:var(--text-muted)">you\'re not following anyone yet ✦</p>';
    return;
  }

  list.innerHTML = '';
  [...followedUsers].forEach(username => {
    const row = document.createElement('div');
    row.className = 'profile-follow-row';

    const nameSpan = document.createElement('span');
    nameSpan.className = 'profile-follow-username';
    nameSpan.textContent = '✦ ' + username;

    const btn = document.createElement('button');
    btn.className = 'btn-unfollow';
    btn.textContent = 'unfollow';
    btn.addEventListener('click', () => {
      toggleFollow(username);
      renderProfileFollowing();
    });

    row.appendChild(nameSpan);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

/* ── Change username ──────────────────────────────────── */
document.getElementById('profile-username-btn').addEventListener('click', async () => {
  const newUsername = document.getElementById('profile-username-input').value.trim();
  const msg = document.getElementById('profile-username-msg');
  const btn = document.getElementById('profile-username-btn');
  if (!newUsername || newUsername === currentUsername) return;

  btn.disabled = true;
  btn.textContent = 'saving...';
  msg.className = 'hidden';

  const { error: authErr } = await sb.auth.updateUser({ data: { username: newUsername } });
  if (authErr) {
    msg.textContent = authErr.message;
    msg.style.color = '#C0534A';
    msg.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'save';
    return;
  }

  // Update all posts with old username
  await sb.from(TABLE).update({ username: newUsername }).eq('user_id', currentUser.id);
  cachedJournalPosts = cachedJournalPosts.map(p => ({ ...p, username: newUsername }));
  cachedFeedPosts    = cachedFeedPosts.map(p => p.user_id === currentUser.id ? { ...p, username: newUsername } : p);

  currentUsername = newUsername;
  topbarUsername.textContent = newUsername;
  profileSection.querySelector('.profile-name').textContent = '@' + newUsername;
  document.getElementById('profile-username-input').value       = '';
  document.getElementById('profile-username-input').placeholder = newUsername;

  msg.textContent  = 'username updated ✦';
  msg.style.color  = 'var(--teal)';
  msg.classList.remove('hidden');
  btn.disabled = false;
  btn.textContent = 'save';
  setTimeout(() => msg.classList.add('hidden'), 3000);
});

/* ── Delete account ───────────────────────────────────── */
document.getElementById('delete-account-btn').addEventListener('click', async () => {
  const confirmed = confirm(
    'are you sure?\n\nthis will permanently delete all your posts.\nthis cannot be undone.'
  );
  if (!confirmed) return;

  document.getElementById('delete-account-btn').textContent = 'deleting...';
  document.getElementById('delete-account-btn').disabled = true;

  await sb.from(TABLE).delete().eq('user_id', currentUser.id);
  await sb.auth.signOut();
});
