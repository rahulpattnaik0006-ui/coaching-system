import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function getDashboardPath(role) {
  switch (String(role || '').toLowerCase()) {
    case 'admin':
    case 'teacher':
      return '/pages/admin.html';
    case 'student':
      return '/pages/student-portal.html';
    default:
      return '/index.html';
  }
}

export async function loginUser(email, password) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
    email,
    password
  });
  if (authError) throw authError;

  const user = authData?.user;
  if (!user) throw new Error('Authentication failed: No user returned.');

  const { data: profileData } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  const role = profileData?.role || user.user_metadata?.role || 'admin';
  const fullName = profileData?.full_name || user.user_metadata?.full_name || user.email.split('@')[0];

  const userObj = {
    id: user.id,
    email: user.email,
    role: String(role).toLowerCase(),
    full_name: fullName
  };

  try {
    localStorage.setItem('supabase_user', JSON.stringify(userObj));
  } catch (_) {}

  window.location.href = getDashboardPath(userObj.role);
}

export async function logoutUser() {
  try {
    await supabase.auth.signOut();
  } finally {
    try {
      localStorage.removeItem('supabase_user');
    } catch (_) {}
  }
}

export async function checkAuth(allowedRoles = []) {
  const profile = await getUserProfile();
  if (!profile) {
    window.location.replace('../index.html');
    return null;
  }
  const role = String(profile.role || '').toLowerCase();
  if (allowedRoles.length > 0 && !allowedRoles.includes(role)) {
    window.location.replace(getDashboardPath(role));
    return null;
  }
  return profile;
}

export async function getUserProfile() {
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (sessionError || !session?.user) {
      try { localStorage.removeItem('supabase_user'); } catch (_) {}
      return null;
    }

    const user = session.user;

    // 1. Check cached user if it matches current session user
    try {
      const stored = localStorage.getItem('supabase_user');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.id === user.id && parsed?.role) {
          return parsed;
        }
      }
    } catch (_) {}

    // 2. Query profiles table safely with select('*') and maybeSingle()
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    const resolvedProfile = {
      id: user.id,
      email: user.email,
      full_name: profile?.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Admin',
      role: String(profile?.role || user.user_metadata?.role || 'admin').toLowerCase()
    };

    try {
      localStorage.setItem('supabase_user', JSON.stringify(resolvedProfile));
    } catch (_) {}

    return resolvedProfile;
  } catch (err) {
    console.error('Error fetching user profile:', err);
    return null;
  }
}