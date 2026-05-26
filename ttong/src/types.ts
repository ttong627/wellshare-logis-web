/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum UserRole {
  ADMIN = 'ROLE_ADMIN',
  EDITOR = 'ROLE_EDITOR',
  VIEWER = 'ROLE_VIEWER'
}

export enum UserStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  DISABLED = 'disabled'
}

export interface AppUser {
  id: string;
  uid: string;
  email: string;
  displayName: string;
  role: UserRole;
  status: UserStatus;
  invitedBy?: string;
  createdAt: string;
  lastLoginAt: string;
}

export interface InviteCode {
  id: string;
  code: string;
  email?: string;
  role: UserRole;
  createdBy: string;
  createdAt: string;
  expiresAt: string;
  used: boolean;
}

export interface Driver {
  id: string;
  name: string;
  phone: string;
  emergency: string;
}

export interface EmergencyContact {
  id: string;
  sido: string;
  sigungu: string;
  phone: string;
  description: string;
  updatedAt: string;
}

export interface ScheduleItem {
  id: string;
  no: number;
  dong: string;
  driverName: string;
  driverPhone: string;
  emergencyPhone: string;
  deliveryDate: string; // Formatting handled by logic
  isCompleted: boolean;
  notes: string;
}

export interface ScheduleData {
  year: number;
  month: number;
  sido: string;
  sigungu: string;
  items: ScheduleItem[];
  lastUpdated?: string;
}

export enum DocType {
  A = 'WELSHARE_SOCIETY',
  B = 'WELSHARE_LOGIS'
}

export interface DocFormatSettings {
  orgName: string;
  slogan: string;
  representative: string;
  representativeTitle: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  publicStatus: string;
  sealText: string;
  themeColor: string;
  // Design properties
  logoUrl?: string;
  fontFamily: string;
  orgNameSize: number;
  orgNameLetterSpacing: number;
  contentSize: number;
  contentColor: string;
  // Header specific
  headerMarginTop: number;
  headerLogoHeight: number;
  showCenterLogo: boolean;
  // Footer specific
  footerMarginTop: number;
  footerLineColor: string;
  footerLineThickness: number;
  footerFontSize: number;
  sealUrl?: string;
  sealShape: 'circle' | 'square';
  sealSize: number;
  sealRightOffset: number;
  sealTopOffset: number;
  // Finer design controls
  orgNameColor: string;
  orgNameFontFamily: string;
  orgNameXOffset: number;
  orgNameYOffset: number;
  sloganColor: string;
  sloganSize: number;
  sloganXOffset: number;
  sloganYOffset: number;
  sloganFontFamily: string;
  // Metadata section (Receiver, Via, Subject)
  metadataSize: number;
  metadataXOffset: number;
  metadataYOffset: number;
  // Separator Line
  lineThickness: number;
  lineWidth: number;
  lineYOffset: number;
  lineColor: string;
  // Body and alignment
  bodyMarginTop: number;
  bodySpacing: number;
  contentXOffset: number;
  contentYOffset: number;
  body1Align: 'left' | 'center' | 'right';
  body2Align: 'left' | 'center' | 'right';
  body3Align: 'left' | 'center' | 'right';
  body4Align: 'left' | 'center' | 'right';
  // Items Styling
  itemsHeader: string;
  itemsHeaderYOffset: number;
  itemsAlign: 'left' | 'center' | 'right';
  itemsSize: number;
  itemsLineHeight: number;
  // Metadata layout
  metadataLabelWidth: number;
  metadataPaddingX: number;
  // Signature section
  signatureXOffset: number;
  signatureYOffset: number;
  manager: string;
  associate: string;
}

export interface DocHistoryItem {
  id: string;
  timestamp: string;
  type: DocType;
  receiver: string;
  subject: string;
  docNo: { year: number; num: number };
  data: OfficialDocSnapshot;
}

export interface OfficialDocSnapshot {
  type: DocType;
  receiver: string;
  via: string;
  subject: string;
  body1: string;
  body2: string;
  body3?: string;
  body4?: string;
  items: string[];
  date: string;
  docNo: {
    year: number;
    num: number;
  };
  docNumber?: string;
  settingsSnapshot: DocFormatSettings;
}

export interface OfficialDoc {
  type: DocType;
  receiver: string;
  via: string;
  subject: string;
  body1: string;
  body2: string;
  body3?: string;
  body4?: string;
  items: string[];
  date: string;
  docNo: {
    year: number;
    num: number;
  };
  docNumber?: string;
  settings: Record<DocType, DocFormatSettings>;
  history: DocHistoryItem[];
  updatedAt?: number;
}
