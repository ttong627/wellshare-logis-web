/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Calendar, Users, Settings as SettingsIcon } from 'lucide-react';
import DeliverySchedule from './delivery/DeliverySchedule';
import DriverManager from './delivery/DriverManager';
import SettingsManager from './delivery/SettingsManager';
import { storage } from '../lib/storage';

enum SubTab {
  SCHEDULE = 'SCHEDULE',
  DRIVERS = 'DRIVERS',
  SETTINGS = 'SETTINGS'
}

export default function DeliveryTab() {
  const [activeSubTab, setActiveSubTab] = useState<SubTab>(SubTab.SCHEDULE);

  useEffect(() => {
    const lastSession = storage.get('scheduleData');
    if (lastSession) {
      // Toast message could be implemented here
    }
  }, []);

  return (
    <div className="bg-white min-h-[calc(100vh-64px)] pb-10">
      {/* Sub Tabs */}
      <div className="bg-gray-100 border-b no-print">
        <div className="max-w-7xl mx-auto flex px-4">
          <button
            onClick={() => setActiveSubTab(SubTab.SCHEDULE)}
            className={`px-8 py-3 flex items-center gap-2 border-b-2 font-bold transition-all ${
              activeSubTab === SubTab.SCHEDULE ? 'border-[#1a3a6b] text-[#1a3a6b]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Calendar size={18} />
            <span>📋 배송일정</span>
          </button>
          <button
            onClick={() => setActiveSubTab(SubTab.DRIVERS)}
            className={`px-8 py-3 flex items-center gap-2 border-b-2 font-bold transition-all ${
              activeSubTab === SubTab.DRIVERS ? 'border-[#1a3a6b] text-[#1a3a6b]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users size={18} />
            <span>👨‍✈️ 기사 관리</span>
          </button>
          <button
            onClick={() => setActiveSubTab(SubTab.SETTINGS)}
            className={`px-8 py-3 flex items-center gap-2 border-b-2 font-bold transition-all ${
              activeSubTab === SubTab.SETTINGS ? 'border-[#1a3a6b] text-[#1a3a6b]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <SettingsIcon size={18} />
            <span>⚙️ 설정</span>
          </button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 md:p-8">
        {activeSubTab === SubTab.SCHEDULE && <DeliverySchedule />}
        {activeSubTab === SubTab.DRIVERS && <DriverManager />}
        {activeSubTab === SubTab.SETTINGS && <SettingsManager />}
      </div>
    </div>
  );
}
