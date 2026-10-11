export async function fetchUsers() {
  try {
    const res = await fetch('/api/v1//users');
    const data = await res.json();
    return data.map((user: any) => ({
      id: user.id,
      name: user.name,
      email: user.email
    }));
  } catch (err) {
    return [];
  }
}

export async function createUser(userData: { name: string; email: string }) {
  const res = await fetch('/api/v1//users', {
    method: 'POST',
    body: JSON.stringify(userData)
  });
  return res.json();
}
