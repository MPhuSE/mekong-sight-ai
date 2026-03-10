import React, { useEffect, useState } from 'react';

interface GaugeProps {
    value: number;
    min?: number;
    max: number;
    label: string;
    unit: string;
    color?: string;
    threshold?: number;
}

export const Gauge: React.FC<GaugeProps> = ({
    value,
    min = 0,
    max,
    label,
    unit,
    color = '#10b981',
    threshold
}) => {
    const [animatedValue, setAnimatedValue] = useState(min);

    useEffect(() => {
        // Simple animation
        let start = animatedValue;
        const end = value;
        const diff = end - start;
        const duration = 1000;
        let startTime: number | null = null;

        const step = (timestamp: number) => {
            if (!startTime) startTime = timestamp;
            const progress = Math.min((timestamp - startTime) / duration, 1);
            setAnimatedValue(start + diff * progress);
            if (progress < 1) requestAnimationFrame(step);
        };

        requestAnimationFrame(step);
    }, [value]);

    // Calculate percentage (0-1)
    const percentage = Math.min(Math.max((animatedValue - min) / (max - min), 0), 1);

    // SVG geometry
    const radius = 40;
    const strokeWidth = 8;
    // Semi-circle arc: 180 degrees
    const circumference = Math.PI * radius;
    const strokeDashoffset = circumference * (1 - percentage);

    // Dynamic color if threshold is exceeded
    const currentColor = (threshold && value > threshold) ? '#ef4444' : color;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{ position: 'relative', width: '120px', height: '80px' }}>
                <svg viewBox="0 0 100 60" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                    {/* Background Arc */}
                    <path
                        d={`M 10 50 A 40 40 0 0 1 90 50`}
                        fill="none"
                        stroke="var(--border-light)"
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                    />

                    {/* Value Arc */}
                    <path
                        d={`M 10 50 A 40 40 0 0 1 90 50`}
                        fill="none"
                        stroke={currentColor}
                        strokeWidth={strokeWidth}
                        strokeLinecap="round"
                        strokeDasharray={circumference}
                        strokeDashoffset={strokeDashoffset}
                        style={{ transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                    />

                    {/* Ticks (Optional) */}
                    <text x="10" y="65" fontSize="8" fill="var(--text-muted)" textAnchor="middle">{min}</text>
                    <text x="90" y="65" fontSize="8" fill="var(--text-muted)" textAnchor="middle">{max}</text>
                </svg>

                {/* Center Value */}
                <div style={{
                    position: 'absolute', bottom: '0', left: '0', right: '0',
                    textAlign: 'center', marginBottom: '-5px'
                }}>
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-dark)' }}>
                        {animatedValue.toFixed(1)}
                    </span>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginLeft: '2px' }}>
                        {unit}
                    </span>
                </div>
            </div>
            <p className="text-secondary" style={{ marginTop: '0.5rem', fontSize: '0.9rem', fontWeight: 500 }}>
                {label}
            </p>
        </div>
    );
};
