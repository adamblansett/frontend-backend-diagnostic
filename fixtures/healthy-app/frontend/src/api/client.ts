export async function fetchUsers() {
  try {
    const res = await fetch('/api/v1/users');
    if (!res.ok) {
      throw new Error(`Failed to fetch users: HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err) {
    console.error('API Error in fetchUsers:', err);
    throw err;
  }
}

export async function createUser(userData: { name: string; email: string }) {
  const res = await fetch('/api/v1/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(userData)
  });
  if (!res.ok) {
    throw new Error(`Failed to create user: HTTP ${res.status}`);
  }
  return res.json();
}
