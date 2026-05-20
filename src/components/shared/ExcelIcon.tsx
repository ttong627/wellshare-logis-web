import React from 'react';

export default function ExcelIcon({ className = 'w-5 h-5' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path d="M14.5 3H20.5C21.3284 3 22 3.67157 22 4.5V19.5C22 20.3284 21.3284 21 20.5 21H14.5V3Z" fill="#21A366"/>
      <path d="M14.5 3H7.5C6.67157 3 6 3.67157 6 4.5V19.5C6 20.3284 6.67157 21 7.5 21H14.5V3Z" fill="#107C41"/>
      <rect x="2" y="6" width="11" height="12" rx="1" fill="#185C37"/>
      <path d="M4.5 9L10.5 15M10.5 9L4.5 15" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <line x1="15.5" y1="7.5" x2="19.5" y2="7.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
      <line x1="15.5" y1="11.5" x2="19.5" y2="11.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
      <line x1="15.5" y1="15.5" x2="19.5" y2="15.5" stroke="white" strokeWidth="1" strokeLinecap="round"/>
    </svg>
  );
}
