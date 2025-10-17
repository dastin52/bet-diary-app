// functions/data/userStore.ts
import { User } from '../telegram/types';

// WARNING: This is a mock implementation and will not work in a production serverless environment.
// It should be replaced with a KV store or database implementation.
export const getUsers = (): User[] => {
    console.warn("getUsers() is using a mock implementation and will not work in a production serverless environment.");
    return [];
};
export const saveUsers = (users: User[]): void => {
    console.warn("saveUsers() is using a mock implementation.");
};
export const findUserBy = (predicate: (user: User) => boolean): User | undefined => {
    console.warn("findUserBy() is using a mock implementation.");
    return undefined;
};
export const updateUser = (updatedUser: User): void => {
    console.warn("updateUser() is using a mock implementation.");
};
export const updateUserStatus = (email: string, status: 'active' | 'blocked'): void => {
    console.warn("updateUserStatus() is using a mock implementation.");
};
export const addUser = (newUser: User): void => {
    console.warn("addUser() is using a mock implementation.");
};
