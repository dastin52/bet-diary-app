import { User } from '../types';

const USERS_STORAGE_KEY = 'betting_app_users';

export const getUsers = (): User[] => {
  try {
    const users = localStorage.getItem(USERS_STORAGE_KEY);
    return users ? JSON.parse(users) : [];
  } catch {
    return [];
  }
};

export const saveUsers = (users: User[]): void => {
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(users));
  } catch (error) {
    console.error("Failed to save users to localStorage", error);
  }
};

export const findUserBy = (predicate: (user: User) => boolean): User | undefined => {
  return getUsers().find(predicate);
};

export const updateUser = (updatedUser: User): void => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.email === updatedUser.email);
  if (userIndex > -1) {
    users[userIndex] = updatedUser;
    saveUsers(users);
  }
};

export const updateUserStatus = (email: string, status: 'active' | 'blocked'): void => {
  const users = getUsers();
  const userIndex = users.findIndex(u => u.email === email);
  if (userIndex > -1) {
    users[userIndex].status = status;
    saveUsers(users);
  }
};


export const addUser = (newUser: User): void => {
  const users = getUsers();
  users.push(newUser);
  saveUsers(users);
};