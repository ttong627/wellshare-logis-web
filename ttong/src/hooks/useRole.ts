import { useMemo } from 'react';
import { useFirebase } from './useFirebase';
import { UserRole, UserStatus } from '../types';

export function useRole() {
  const { userProfile } = useFirebase();

  const role = userProfile?.role || UserRole.VIEWER;
  const status = userProfile?.status || UserStatus.PENDING;

  const isAdmin = role === UserRole.ADMIN;
  const isEditor = role === UserRole.ADMIN || role === UserRole.EDITOR;
  const canEdit = status === UserStatus.ACTIVE && (role === UserRole.ADMIN || role === UserRole.EDITOR);
  const canView = status === UserStatus.ACTIVE;

  return useMemo(() => ({
    role,
    status,
    isAdmin,
    isEditor,
    canEdit,
    canView,
    userProfile
  }), [role, status, isAdmin, isEditor, canEdit, canView, userProfile]);
}
