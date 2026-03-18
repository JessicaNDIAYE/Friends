/* ═══════════════════════════════════════════════════════
   PaperWall — script.js
   Stack: Vanilla JS + Supabase JS v2

   ⚙️  SETUP — paste your values below:
═══════════════════════════════════════════════════════ */

const SUPABASE_URL      = 'https://tvklioergzytwupzxfyi.supabase.co';
// Paste your anon/public key here (Supabase dashboard → Project Settings → API)
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// Table and storage bucket names (must match what was created in Supabase)
const TABLE   = 'paperwall_posts';
const BUCKET  = 'paperwall-images';

/* ═══════════════════════════════════════════════════════
   INIT SUPABASE CLIENT
═══════════════════════════════════════════════════════ */
const { createClient } = supabase;
const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/* ═══════════════════════════════════════════════════════
   STATE
═══════════════════════════════════════════════════════ */
let currentUser     = null;
let currentUsername = null;
let selectedFile    = null;
let activeTab       = 'feed'; // 'feed' | 'journal'

/* ═══════════════════════════════════════════════════════
   DOM REFS
═══════════════════════════════════════════════════════ */
const authScreen      = document.getElementById('auth-screen');
const appEl           = document.getElementById('app');
const topbarUsername  = document.getElementById('topbar-username');
const logoutBtn       = document.getElementById('logout-btn');

// Auth forms
const loginForm       = document.getElementById('login-form');
const signupForm      = document.getElementById('signup-form');
const loginEmail      = document.getElementById('login-email');
const loginPassword   = document.getElementById('login-password');
const loginError      = document.getElementById('login-error');
const signupEmail     = document.getElementById('signup-email');
const signupPassword  = document.getElementById('signup-password');
const signupUsername  = document.getElementById('signup-username');
const signupError     = document.getElementById('signup-error');
const signupSuccess   = document.getElementById('signup-success');
const authTabs        = document.querySelectorAll('.auth-tab');

// Composer
const postContent     = document.getElementById('post-content');
const postImage       = document.getElementById('post-image');
const imagePreviewWrap= document.getElementById('image-preview-wrap');
const imagePreview    = document.getElementById('image-preview');
const removeImageBtn  = document.getElementById('remove-image');
const submitPostBtn   = document.getElementById('submit-post');
const isPrivateToggle = document.getElementById('is-private-toggle');
const privacyLabelText= document.getElementById('privacy-label-text');
const postError       = document.getElementById('post-error');

// Nav / sections
const navTabs         = document.querySelectorAll('.nav-tab');
const feedSection     = document.getElementById('feed-section');
const journalSection  = document.getElementById('journal-section');
const feedPostsEl     = document.getElementById('feed-posts');
const journalPostsEl  = document.getElementById('journal-posts');

// Card template
const cardTemplate    = document.getElementById('post-card-template');

/* ═══════════════════════════════════════════════════════
   BOOT — check session
═══════════════════════════════════════════════════════ */
(async () => {
  const { data: { session } } = await sb.auth.getSession();
  if (session) {
    currentUser = session.user;
    await loadUsername();
    showApp();
  } else {
    showAuth();
  }

  // Listen for auth state changes
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

/* ═══════════════════════════════════════════════════════
   HELPERS — show/hide screens
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

/* Load username from user_metadata */
async function loadUsername() {
  const meta = currentUser.user_metadata;
  if (meta && meta.username) {
    currentUsername = meta.username;
    return;
  }
  // Fallback: query from their most recent post
  const { data } = await sb
    .from(TABLE)
    .select('username')
    .eq('user_id', currentUser.id)
    .limit(1);
  if (data && data.length > 0) {
    currentUsername = data[0].username;
  }
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
    loginError.textContent = '';
    signupError.textContent = '';
    signupSuccess.textContent = '';
  });
});

/* ═══════════════════════════════════════════════════════
   AUTH — login
═══════════════════════════════════════════════════════ */
loginForm.addEventListener('submit', async e => {
  e.preventDefault();
  loginError.textContent = '';
  const btn = loginForm.querySelector('.btn-primary');
  btn.disabled = true;
  btn.textContent = 'opening...';

  const { error } = await sb.auth.signInWithPassword({
    email:    loginEmail.value.trim(),
    password: loginPassword.value,
  });

  if (error) {
    loginError.textContent = error.message;
    btn.disabled = false;
    btn.textContent = 'open my journal →';
  }
  // On success, onAuthStateChange handles the rest
});

/* ═══════════════════════════════════════════════════════
   AUTH — sign up
═══════════════════════════════════════════════════════ */
signupForm.addEventListener('submit', async e => {
  e.preventDefault();
  signupError.textContent = '';
  signupSuccess.textContent = '';
  const btn = signupForm.querySelector('.btn-primary');
  btn.disabled = true;
  btn.textContent = 'creating...';

  const username = signupUsername.value.trim();
  if (!username) {
    signupError.textContent = 'please enter a username';
    btn.disabled = false;
    btn.textContent = 'start my journal →';
    return;
  }

  const { error } = await sb.auth.signUp({
    email:    signupEmail.value.trim(),
    password: signupPassword.value,
    options:  { data: { username } }
  });

  btn.disabled = false;
  btn.textContent = 'start my journal →';

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
logoutBtn.addEventListener('click', async () => {
  await sb.auth.signOut();
});

/* ═══════════════════════════════════════════════════════
   NAV TABS
═══════════════════════════════════════════════════════ */
navTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    navTabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    activeTab = tab.dataset.tab;

    feedSection.classList.toggle('active', activeTab === 'feed');
    journalSection.classList.toggle('active', activeTab === 'journal');
  });
});

/* ═══════════════════════════════════════════════════════
   PRIVACY TOGGLE
═══════════════════════════════════════════════════════ */
isPrivateToggle.addEventListener('change', () => {
  privacyLabelText.textContent = isPrivateToggle.checked
    ? 'private 🔒'
    : 'public 🌍';
});

/* ═══════════════════════════════════════════════════════
   IMAGE PICKER PREVIEW
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
  submitPostBtn.textContent = 'pinning...';

  try {
    let imageUrl = null;

    // 1. Upload image if one was selected
    if (selectedFile) {
      imageUrl = await uploadImage(selectedFile);
    }

    // 2. Insert post into database
    const { error } = await sb.from(TABLE).insert({
      user_id:    currentUser.id,
      username:   currentUsername || currentUser.email,
      content,
      image_url:  imageUrl,
      is_private: isPrivateToggle.checked,
    });

    if (error) throw error;

    // 3. Reset composer
    postContent.value = '';
    selectedFile = null;
    postImage.value = '';
    imagePreview.src = '';
    imagePreviewWrap.classList.add('hidden');
    isPrivateToggle.checked = false;
    privacyLabelText.textContent = 'public 🌍';

    // 4. Refresh the relevant section
    if (isPrivateToggle.checked) {
      await loadJournal();
    } else {
      await loadFeed();
      await loadJournal();
    }

    // Both reload since the toggle was already reset
    await loadFeed();
    await loadJournal();

  } catch (err) {
    postError.textContent = err.message || 'something went wrong';
  } finally {
    submitPostBtn.disabled = false;
    submitPostBtn.textContent = 'pin it ✦';
  }
});

/* ═══════════════════════════════════════════════════════
   IMAGE UPLOAD — stores under user_id/filename
═══════════════════════════════════════════════════════ */
async function uploadImage(file) {
  const ext      = file.name.split('.').pop();
  const filename = `${currentUser.id}/${Date.now()}.${ext}`;

  const { error } = await sb.storage
    .from(BUCKET)
    .upload(filename, file, { upsert: false });

  if (error) throw error;

  const { data } = sb.storage.from(BUCKET).getPublicUrl(filename);
  return data.publicUrl;
}

/* ═══════════════════════════════════════════════════════
   FETCH — public feed
═══════════════════════════════════════════════════════ */
async function loadFeed() {
  feedPostsEl.innerHTML = '<div class="loading-note">loading pages...</div>';

  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .eq('is_private', false)
    .order('created_at', { ascending: false });

  if (error) {
    feedPostsEl.innerHTML = `<div class="empty-note">couldn't load posts 😕<br><small>${error.message}</small></div>`;
    return;
  }

  renderPosts(feedPostsEl, data, 'feed');
}

/* ═══════════════════════════════════════════════════════
   FETCH — private journal (current user only)
═══════════════════════════════════════════════════════ */
async function loadJournal() {
  if (!currentUser) return;
  journalPostsEl.innerHTML = '<div class="loading-note">loading your entries...</div>';

  const { data, error } = await sb
    .from(TABLE)
    .select('*')
    .eq('user_id', currentUser.id)
    .eq('is_private', true)
    .order('created_at', { ascending: false });

  if (error) {
    journalPostsEl.innerHTML = `<div class="empty-note">couldn't load journal 😕<br><small>${error.message}</small></div>`;
    return;
  }

  renderPosts(journalPostsEl, data, 'journal');
}

/* ═══════════════════════════════════════════════════════
   RENDER POSTS — builds cards from template
═══════════════════════════════════════════════════════ */
function renderPosts(container, posts, context) {
  container.innerHTML = '';

  if (!posts || posts.length === 0) {
    const msg = context === 'journal'
      ? 'nothing here yet...<br>this is your safe space ✦'
      : 'no posts yet — be the first ✦';
    container.innerHTML = `<div class="empty-note">${msg}</div>`;
    return;
  }

  posts.forEach((post, i) => {
    const card = buildCard(post, i);
    container.appendChild(card);
  });
}

/* ═══════════════════════════════════════════════════════
   BUILD A POST CARD
═══════════════════════════════════════════════════════ */
function buildCard(post, index) {
  const clone = cardTemplate.content.cloneNode(true);
  const card  = clone.querySelector('.post-card');

  // Random slight rotation — feels like paper notes scattered on a desk
  const rotations = [-2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2];
  const rot = rotations[index % rotations.length];
  card.style.setProperty('--card-rot', `${rot}deg`);
  card.style.transform = `rotate(${rot}deg)`;

  // Random tape rotation
  const tapeRot = (Math.random() * 4 - 2).toFixed(1);
  card.style.setProperty('--tape-rot', `${tapeRot}deg`);

  // Random image tilt for photos
  const imgRot = (Math.random() * 4 - 2).toFixed(1);
  card.style.setProperty('--img-rot', `${imgRot}deg`);

  // Populate content
  card.querySelector('.post-username').textContent = post.username;
  card.querySelector('.post-date').textContent     = formatDate(post.created_at);
  card.querySelector('.post-content-text').textContent = post.content;

  // Image (if any)
  if (post.image_url) {
    const imgWrap = card.querySelector('.post-image-wrap');
    const img     = card.querySelector('.post-image');
    img.src = post.image_url;
    img.alt = `${post.username}'s photo`;
    imgWrap.classList.remove('hidden');
  }

  // Privacy badge
  const badge = card.querySelector('.post-privacy-badge');
  badge.textContent = post.is_private ? '🔒 private' : '🌍 public';

  // Stagger animation delay
  card.style.animationDelay = `${index * 60}ms`;

  return clone;
}

/* ═══════════════════════════════════════════════════════
   DATE FORMATTING — journal style
   e.g. "Monday, March 18 · 9:41 pm"
═══════════════════════════════════════════════════════ */
function formatDate(isoString) {
  const d = new Date(isoString);
  const days   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const months = ['January','February','March','April','May','June',
                  'July','August','September','October','November','December'];

  const day   = days[d.getDay()];
  const month = months[d.getMonth()];
  const date  = d.getDate();
  const hours = d.getHours();
  const mins  = String(d.getMinutes()).padStart(2, '0');
  const ampm  = hours >= 12 ? 'pm' : 'am';
  const hour12 = hours % 12 || 12;

  return `${day}, ${month} ${date} · ${hour12}:${mins} ${ampm}`;
}
