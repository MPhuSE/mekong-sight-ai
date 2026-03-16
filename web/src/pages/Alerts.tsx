import React, { useEffect, useState } from 'react';
import { farmService } from '../services/farm.service';
import { Bell, AlertTriangle, AlertCircle, CheckCircle2, Info, Loader2 } from 'lucide-react';
import { EmptyState } from '../components/EmptyState';
import { SectionCard } from '../components/SectionCard';
import { StatusBadge } from '../components/StatusBadge';

const SEVERITY_LABELS = {
  critical: 'Nghiêm trọng',
  warning: 'Cần lưu ý',
  info: 'Thông tin',
} as const;

const getSeverityTone = (severity: string) => {
  switch (severity) {
    case 'critical':
      return 'warning' as const;
    case 'warning':
      return 'watch' as const;
    case 'info':
      return 'info' as const;
    default:
      return 'neutral' as const;
  }
};

export const Alerts: React.FC = () => {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchAlerts = async () => {
    try {
      const data = await farmService.getAlerts();
      setAlerts(data.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  const acknowledgeAlert = async (id: string) => {
    try {
      await farmService.acknowledgeAlert(id);
      fetchAlerts();
    } catch (err) {
      console.error(err);
    }
  };

  const getIcon = (severity: string) => {
    switch (severity) {
      case 'critical':
        return <AlertCircle size={22} />;
      case 'warning':
        return <AlertTriangle size={22} />;
      case 'info':
        return <Info size={22} />;
      default:
        return <Bell size={22} />;
    }
  };

  return (
    <div className="alerts-page" style={{ animation: 'fadeIn 0.5s ease-out' }}>
      <SectionCard title="Danh sách cảnh báo" icon={<Bell size={18} />}>
        {loading ? (
          <div className="alerts-loading">
            <Loader2 className="animate-spin" size={40} color="var(--primary-green)" />
          </div>
        ) : alerts.length === 0 ? (
          <EmptyState
            icon={<CheckCircle2 size={24} />}
            title="Không có cảnh báo cần xử lý"
            description="Hiện tại hệ thống chưa ghi nhận cảnh báo nào."
          />
        ) : (
          <div className="alerts-list">
            {alerts.map((alert) => {
              const tone = getSeverityTone(alert.severity);
              return (
                <article key={alert.id} className={`alerts-item tone-${tone}`}>
                  <div className="alerts-item-icon">{getIcon(alert.severity)}</div>
                  <div className="alerts-item-main">
                    <div className="alerts-item-head">
                      <div>
                        <h3>{alert.title}</h3>
                        <p>{alert.message}</p>
                      </div>
                      <div className="alerts-item-meta">
                        <StatusBadge tone={tone}>
                          {SEVERITY_LABELS[alert.severity as keyof typeof SEVERITY_LABELS] || 'Thông tin'}
                        </StatusBadge>
                        <span>{new Date(alert.created_at).toLocaleString('vi-VN')}</span>
                      </div>
                    </div>

                    <div className="alerts-item-foot">
                      <span className="alerts-farm-chip">Mã trang trại: {alert.farm_id?.slice(0, 8) || '---'}</span>
                      {alert.status === 'active' ? (
                        <button className="ph-btn ph-btn-secondary" onClick={() => acknowledgeAlert(alert.id)}>
                          Xác nhận đã xem
                        </button>
                      ) : (
                        <StatusBadge tone="safe">Đã xác nhận</StatusBadge>
                      )}
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
};
