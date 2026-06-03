import React, { useMemo } from 'react';
import { Contact } from 'lucide-react';
import { CONTACTS, GOV_CONTACTS } from '../../constants/members';
import { getRegionTheme } from '../../constants/regions';
import { safeRender } from '../../lib/utils';

export default function ContactsTab() {
  const groupedContacts = useMemo(() => {
    return CONTACTS.reduce<Record<string, typeof CONTACTS>>((acc, curr) => {
      if (!acc[curr.agency]) acc[curr.agency] = [];
      acc[curr.agency].push(curr);
      return acc;
    }, {});
  }, []);

  return (
    <div className="anim-in space-y-5">
      <div className="sky-hero p-6 sm:p-8 text-white">
        <div className="flex items-center gap-3 relative z-10">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center flex-shrink-0"
            style={{ background: 'rgba(255,255,255,.18)', backdropFilter: 'blur(8px)' }}>
            <Contact size={22} className="text-white" />
          </div>
          <div>
            <div className="text-sky-200 text-[10px] font-bold uppercase tracking-widest mb-0.5">Address Book</div>
            <h2 className="text-2xl sm:text-3xl font-black tracking-tight" style={{ textShadow: '0 2px 8px rgba(0,0,0,.2)' }}>
              파트너사 및 지자체 주소록
            </h2>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {Object.entries(groupedContacts).map(([agency, contacts]) => (
          <div key={agency} className="glass rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-sky-100 flex items-center gap-2"
              style={{ background: 'linear-gradient(135deg,rgba(14,165,233,.07),rgba(56,189,248,.03))' }}>
              <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg,#0ea5e9,#38bdf8)' }} />
              <h3 className="font-black text-sky-700 text-sm">{safeRender(agency)}</h3>
            </div>
            <div className="divide-y divide-sky-50">
              {contacts.map((c, i) => (
                <div key={i} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 hover:bg-sky-50/50 transition-colors">
                  <div className="flex flex-col">
                    <span className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getRegionTheme(c.region).dot }} />
                      {safeRender(c.region)}
                    </span>
                    {c.detail && <span className="text-xs text-sky-400 mt-0.5 ml-3.5">{safeRender(c.detail)}</span>}
                  </div>
                  <div className="flex flex-col sm:items-end">
                    {c.manager && <span className="text-xs sm:text-sm font-bold text-slate-600">{safeRender(c.manager)}</span>}
                    {c.phone && <span className="text-xs sm:text-sm font-black text-sky-600">{safeRender(c.phone)}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="glass rounded-2xl overflow-hidden">
        <div className="px-5 py-3 border-b border-sky-100 flex items-center gap-2"
          style={{ background: 'linear-gradient(135deg,rgba(14,165,233,.07),rgba(56,189,248,.03))' }}>
          <div className="w-1.5 h-4 rounded-full" style={{ background: 'linear-gradient(180deg,#0ea5e9,#38bdf8)' }} />
          <h3 className="font-black text-sky-700 text-sm">지자체 담당자 연락망</h3>
        </div>
        <div className="divide-y divide-sky-50">
          {GOV_CONTACTS.map((g, i) => (
            <div key={i} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 hover:bg-sky-50/50 transition-colors">
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-700 text-sm flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: getRegionTheme(g.region).dot }} />
                  {safeRender(g.region)}
                </span>
                <span className="text-[10px] text-sky-500 bg-sky-100 px-2 py-0.5 rounded-full font-bold">{safeRender(g.order)}</span>
              </div>
              <div className="flex flex-col sm:items-end">
                {g.manager && g.manager !== '-' && <span className="text-xs sm:text-sm font-bold text-slate-600">{safeRender(g.manager)}</span>}
                <span className="text-xs sm:text-sm font-black text-sky-600">{safeRender(g.phone)}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
