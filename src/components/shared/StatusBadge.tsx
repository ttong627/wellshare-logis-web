import React from 'react';
import { CheckCircle2, Send, ReceiptText, Hourglass, Truck } from 'lucide-react';

// 결제·정산 상태 배지 — 색 + 아이콘 + 텍스트 3중 표기 (색맹 대비)
export type BadgeVariant = 'wait' | 'requested' | 'issued' | 'done' | 'paid';

const ICONS: Record<BadgeVariant, React.ComponentType<{ size?: number }>> = {
  wait: Hourglass,
  requested: Send,
  issued: ReceiptText,
  done: Truck,
  paid: CheckCircle2,
};

interface StatusBadgeProps {
  variant: BadgeVariant;
  label: string;
  iconSize?: number;
  className?: string;
}

export default function StatusBadge({ variant, label, iconSize = 12, className = '' }: StatusBadgeProps) {
  const Icon = ICONS[variant];
  return (
    <span
      className={`fin-badge ${className}`}
      style={{
        background: `var(--st-${variant}-bg)`,
        color: `var(--st-${variant}-fg)`,
        borderColor: `var(--st-${variant}-bd)`,
      }}
    >
      <Icon size={iconSize} />
      {label}
    </span>
  );
}
