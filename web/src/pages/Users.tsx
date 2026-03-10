import React, { useState, useEffect } from 'react';
import { getAllUsers } from '../services/user.service';
import { UserPlus, Search, MoreVertical } from 'lucide-react';

export const Users: React.FC = () => {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchUsers = async () => {
        try {
            const data = await getAllUsers();
            setUsers(data);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchUsers();
    }, []);

    return (
        <div style={{ animation: 'fadeIn 0.5s ease-out' }}>
            <div className="flex justify-between items-center" style={{ marginBottom: '2.5rem' }}>
                <div>
                    <h1 style={{ marginBottom: '0.5rem' }}>Quản lý người dùng</h1>
                    <p className="text-secondary">Phân quyền và quản lý tài khoản thành viên trong hệ thống.</p>
                </div>
                <button className="primary">
                    <UserPlus size={18} /> Thêm thành viên
                </button>
            </div>

            <div className="card glass-card" style={{ padding: 0, overflow: 'hidden' }}>
                <div style={{ padding: '1.5rem', borderBottom: '1px solid var(--border-subtle)', display: 'flex', gap: '1rem' }}>
                    <div style={{ position: 'relative', flex: 1 }}>
                        <Search size={18} style={{ position: 'absolute', left: '1rem', top: '0.8rem', color: 'var(--text-dim)' }} />
                        <input
                            placeholder="Tìm kiếm tên, số điện thoại..."
                            style={{ marginBottom: 0, paddingLeft: '3rem' }}
                        />
                    </div>
                    <button className="secondary">Lọc</button>
                </div>

                <div style={{ overflowX: 'auto' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                            <tr style={{ background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid var(--border-subtle)' }}>
                                <th style={{ padding: '1.2rem' }}>Thành viên</th>
                                <th style={{ padding: '1.2rem' }}>Vai trò</th>
                                <th style={{ padding: '1.2rem' }}>Số điện thoại</th>
                                <th style={{ padding: '1.2rem' }}>Trạng thái</th>
                                <th style={{ padding: '1.2rem' }}>Truy cập cuối</th>
                                <th style={{ padding: '1.2rem' }}></th>
                            </tr>
                        </thead>
                        <tbody>
                            {loading && (
                                <tr>
                                    <td colSpan={6} style={{ padding: '1.2rem', color: 'var(--text-dim)' }}>
                                        Đang tải danh sách người dùng...
                                    </td>
                                </tr>
                            )}
                            {users.map((user) => (
                                <tr key={user.id} style={{ borderBottom: '1px solid var(--border-subtle)', transition: 'background 0.2s' }} className="table-row-hover">
                                    <td style={{ padding: '1.2rem' }}>
                                        <div className="flex items-center gap-3">
                                            <div style={{ width: 40, height: 40, borderRadius: '10px', background: 'var(--primary-gradient)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 'bold' }}>
                                                {user.full_name.charAt(0)}
                                            </div>
                                            <div>
                                                <p style={{ fontWeight: 600 }}>{user.full_name}</p>
                                                <p style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>ID: {user.id.substring(0, 8)}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1.2rem' }}>
                                        <span style={{ fontSize: '0.85rem', padding: '4px 8px', background: 'rgba(59, 130, 246, 0.1)', color: 'var(--primary-glow)', borderRadius: '6px' }}>
                                            {user.role}
                                        </span>
                                    </td>
                                    <td style={{ padding: '1.2rem', fontSize: '0.85rem' }}>{user.phone_number}</td>
                                    <td style={{ padding: '1.2rem' }}>
                                        <div className="flex items-center gap-2">
                                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: user.status === 'active' ? 'var(--success)' : 'var(--text-dim)' }}></div>
                                            <span style={{ fontSize: '0.85rem' }}>{user.status === 'active' ? 'Trực tuyến' : 'Ngoại tuyến'}</span>
                                        </div>
                                    </td>
                                    <td style={{ padding: '1.2rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>{user.last_login}</td>
                                    <td style={{ padding: '1.2rem' }}>
                                        <button className="secondary" style={{ padding: '8px', borderRadius: '50%' }}>
                                            <MoreVertical size={16} />
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
