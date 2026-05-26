import React, { useState, useEffect } from 'react';
import { UserPlus, CheckCircle, Trash2, Copy, UserX } from 'lucide-react';
import { firebaseService } from '../../lib/firebaseService';
import { useFirebase } from '../../hooks/useFirebase';
import { AppUser, UserRole, UserStatus } from '../../types';

export default function UserManager() {
  const { user: currentUser } = useFirebase();
  const [users, setUsers] = useState<AppUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>(UserRole.EDITOR);
  const [lastInviteCode, setLastInviteCode] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = firebaseService.subscribeToAllUsers((list) => {
      setUsers(list);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  const handleRoleChange = async (uid: string, role: UserRole) => {
    if (uid === currentUser?.uid) return;
    try {
      await firebaseService.updateUserRoleOrStatus(uid, { role });
    } catch {
      alert('권한 변경에 실패했습니다.');
    }
  };

  const handleStatusToggle = async (uid: string, currentStatus: UserStatus) => {
    if (uid === currentUser?.uid) return;
    let nextStatus: UserStatus;
    
    if (currentStatus === UserStatus.PENDING || currentStatus === UserStatus.DISABLED) {
      nextStatus = UserStatus.ACTIVE;
    } else {
      nextStatus = UserStatus.DISABLED;
    }

    try {
      await firebaseService.updateUserRoleOrStatus(uid, { status: nextStatus });
    } catch {
      alert('상태 변경에 실패했습니다.');
    }
  };

  const handleDeleteUser = async (uid: string) => {
    if (uid === currentUser?.uid) return;
    if (confirm('이 사용자를 시스템에서 삭제하시겠습니까? 데이터 접근이 즉시 차단됩니다.')) {
      if (confirm('최종 확인: 정말로 삭제하시겠습니까?')) {
        try {
          await firebaseService.deleteUser(uid);
        } catch {
          alert('사용자 삭제에 실패했습니다.');
        }
      }
    }
  };

  const handleCreateInvite = async () => {
    if (!currentUser) return;
    try {
      const code = await firebaseService.createInvite(inviteEmail, inviteRole, currentUser.uid);
      setLastInviteCode(code);
      setInviteEmail('');
      
      const inviteUrl = `${window.location.origin}${window.location.pathname}?invite=${code}`;
      await navigator.clipboard.writeText(inviteUrl);
      alert('초대 링크가 클립보드에 복사되었습니다. (24시간 유효)');
    } catch {
      alert('초대 링크 생성에 실패했습니다.');
    }
  };

  const pendingCount = users.filter(u => u.status === UserStatus.PENDING).length;

  if (loading) {
    return <div className="p-8 text-center text-gray-500">불러오는 중...</div>;
  }

  return (
    <div className="space-y-8">
      {/* Invite Section */}
      <div className="bg-[#0d2142] p-6 rounded-xl border border-blue-500/20 shadow-lg">
        <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
          <UserPlus size={20} className="text-blue-400" />
          공동 작업자 초대
        </h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            type="email" 
            placeholder="초대할 이메일 (선택사항)"
            value={inviteEmail}
            onChange={e => setInviteEmail(e.target.value)}
            className="flex-1 bg-[#1a3a6b] border-none rounded-lg px-4 py-2.5 text-white outline-none focus:ring-2 focus:ring-blue-500 transition-all"
          />
          <select 
            value={inviteRole}
            onChange={e => setInviteRole(e.target.value as UserRole)}
            className="bg-[#1a3a6b] border-none rounded-lg px-4 py-2.5 text-white outline-none cursor-pointer"
          >
            <option value={UserRole.EDITOR}>편집자 (EDITOR)</option>
            <option value={UserRole.VIEWER}>뷰어 (VIEWER)</option>
            <option value={UserRole.ADMIN}>관리자 (ADMIN)</option>
          </select>
          <button 
            onClick={handleCreateInvite}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2.5 px-6 rounded-lg transition-all flex items-center justify-center gap-2"
          >
            <Copy size={18} /> 초대 링크 복사
          </button>
        </div>
        {lastInviteCode && (
          <p className="mt-3 text-xs text-blue-300 bg-blue-900/30 p-2 rounded border border-blue-500/10 font-mono">
            최근 생성된 초대 코드: {lastInviteCode} (복사 완료)
          </p>
        )}
      </div>

      {/* Users List */}
      <div className="bg-white rounded-xl shadow-md border border-gray-200 overflow-hidden">
        <div className="p-4 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
          <h3 className="font-bold text-gray-800 flex items-center gap-2">
            시스템 사용자 목록
            {pendingCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full animate-pulse">
                대기 {pendingCount}
              </span>
            )}
          </h3>
          <span className="text-xs text-gray-500">전체 {users.length}명</span>
        </div>
        
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-[#f8fafc] text-[#64748b] text-xs uppercase">
              <tr>
                <th className="px-6 py-4">사용자</th>
                <th className="px-6 py-4">이메일</th>
                <th className="px-6 py-4">권한</th>
                <th className="px-6 py-4">상태</th>
                <th className="px-6 py-4">최근 접속</th>
                <th className="px-6 py-4 text-center">관리</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {users.map(user => {
                const isMe = user.uid === currentUser?.uid;
                
                return (
                  <tr key={user.id} className={`${isMe ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      <div className="flex items-center gap-2">
                        {user.displayName}
                        {isMe && <span className="text-[10px] bg-blue-100 text-blue-700 font-bold px-1 rounded">나</span>}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-gray-600">{user.email}</td>
                    <td className="px-6 py-4">
                      {isMe ? (
                        <span className="text-xs font-bold px-2 py-1 bg-gray-100 rounded">
                          {user.role.replace('ROLE_', '')}
                        </span>
                      ) : (
                        <select 
                          value={user.role}
                          onChange={e => handleRoleChange(user.uid, e.target.value as UserRole)}
                          className="text-xs bg-gray-50 border border-gray-200 rounded p-1 outline-none"
                        >
                          <option value={UserRole.ADMIN}>ADMIN</option>
                          <option value={UserRole.EDITOR}>EDITOR</option>
                          <option value={UserRole.VIEWER}>VIEWER</option>
                        </select>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          user.status === UserStatus.ACTIVE ? 'bg-green-500' : 
                          user.status === UserStatus.PENDING ? 'bg-amber-500' : 'bg-red-500'
                        }`}></span>
                        <span className="text-xs">
                          {user.status === UserStatus.ACTIVE ? '활성' : 
                           user.status === UserStatus.PENDING ? '대기' : '잠금'}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs text-gray-400 font-mono">
                      {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2">
                        {!isMe && (
                          <>
                            <button 
                              onClick={() => handleStatusToggle(user.uid, user.status)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                user.status === UserStatus.ACTIVE 
                                  ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' 
                                  : 'bg-green-100 text-green-600 hover:bg-green-200'
                              }`}
                              title={user.status === UserStatus.ACTIVE ? '비활성화' : '활성화/승인'}
                            >
                              {user.status === UserStatus.ACTIVE ? <UserX size={16} /> : <CheckCircle size={16} />}
                            </button>
                            <button 
                              onClick={() => handleDeleteUser(user.uid)}
                              className="p-1.5 bg-red-100 text-red-600 hover:bg-red-200 rounded-lg transition-colors"
                              title="삭제"
                            >
                              <Trash2 size={16} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
