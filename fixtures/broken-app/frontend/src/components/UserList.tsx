import { fetchUsers } from '../api/client.js';

export async function renderUserList() {
  const users = await fetchUsers();
  return users.map((user: any) => `<div>${user.id}: ${user.name} (${user.email})</div>`).join('');
}
