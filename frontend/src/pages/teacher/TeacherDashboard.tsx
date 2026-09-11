import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../api';
import TeacherHeader from '../../components/TeacherHeader';
import {
  HardDrive, BookOpen, FileText, Upload, Monitor,
  CheckCircle, AlertCircle, Clock, TrendingUp,
} from 'lucide-react';

interface SubjectBreakdown {
  id: number;
  name: string;
  grade: string;
  chapters: number;
  files: number;
  size_bytes: number;
  size_display: string;
  last_modified: string | null;
}

interface DashboardData {
  total_subjects: number;
  total_chapters: number;
  total_assets: number;
  total_size_bytes: number;
  total_size_display: string;
  active_assets: number;
  soft_deleted_assets: number;
  current_manifest_version: number;
  last_sync_timestamp: string | null;
  devices_total: number;
  devices_up_to_date: number;
  devices_behind: number;
  subject_breakdown: SubjectBreakdown[];
}

interface ActivityItem {
  id: number;
  teacher_name: string;
  action: string;
  asset_filename: string;
  subject_name: string;
  chapter_title: string;
  timestamp: string;
  notes: string;
}

const STAT_COLORS = [
  { bg: 'bg-cobalt', text: 'text-white' },
  { bg: 'bg-mint', text: 'text-structural' },
  { bg: 'bg-gold', text: 'text-structural' },
  { bg: 'bg-lilac', text: 'text-white' },
];

const ACTION_LABELS: Record<string, { label: string; color: string }> = {
  upload: { label: 'Uploaded', color: 'bg-mint' },
  remove: { label: 'Removed', color: 'bg-gold' },
  restore: { label: 'Restored', color: 'bg-cobalt' },
  hard_delete: { label: 'Purged', color: 'bg-coral' },
};

const TeacherDashboard = () => {
  const navigate = useNavigate();
  const teacherName = localStorage.getItem('teacher_name') || 'Teacher';
  const [data, setData] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchDashboard();
  }, []);

  const fetchDashboard = async () => {
    setLoading(true);
    setError('');
    try {
      const [dashRes, actRes] = await Promise.all([
        api.get('teacher/dashboard/'),
        api.get('teacher/activity/?limit=10'),
      ]);
      setData(dashRes.data);
      setActivity(actRes.data.results || []);
    } catch (err: any) {
      if (err?.response?.status === 401 || err?.response?.status === 403) {
        navigate('/teacher');
        return;
      }
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (mins < 1) return 'Just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return d.toLocaleDateString();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas">
        <TeacherHeader />
        <div className="flex flex-col items-center justify-center py-32 gap-4">
          <div className="clay-spinner"></div>
          <p className="font-grotesk font-bold text-xs uppercase tracking-wider text-on-surface-variant">
            Loading Dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas">
      <TeacherHeader />

      <div className="max-w-6xl mx-auto p-6 md:p-10">
        {/* Header */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-8 gap-4">
          <div>
            <h1 className="font-syne text-3xl font-[800] text-structural tracking-tight">
              Welcome back, {teacherName} 👋
            </h1>
            <p className="text-on-surface-variant mt-1 font-jakarta">
              Manage your curriculum content and track student sync status
            </p>
          </div>
          <button
            onClick={() => navigate('/teacher/content/upload')}
            className="clay-btn bg-cobalt text-white px-6 py-2.5 text-sm flex items-center gap-2"
          >
            <Upload size={16} />
            Upload Content
          </button>
        </div>

        {error && (
          <div className="clay-card bg-white p-4 mb-6 border-l-[8px] border-l-coral flex items-center gap-3">
            <AlertCircle size={20} className="text-coral flex-shrink-0" />
            <p className="text-sm font-jakarta text-stone-800">{error}</p>
          </div>
        )}

        {data && (
          <>
            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Total Size', value: data.total_size_display, icon: HardDrive, color: STAT_COLORS[0] },
                { label: 'Chapters', value: data.total_chapters.toString(), icon: BookOpen, color: STAT_COLORS[1] },
                { label: 'Content Files', value: data.active_assets.toString(), icon: FileText, color: STAT_COLORS[2] },
                { label: 'Manifest Version', value: `v${data.current_manifest_version}`, icon: TrendingUp, color: STAT_COLORS[3] },
              ].map((stat, i) => (
                <div key={i} className="clay-card bg-white p-5 flex flex-col gap-3">
                  <div className={`w-10 h-10 clay-circle ${stat.color.bg} flex items-center justify-center`}>
                    <stat.icon size={18} className={stat.color.text} />
                  </div>
                  <div>
                    <p className="font-syne text-2xl font-bold text-structural">{stat.value}</p>
                    <p className="label-text text-[10px] text-on-surface-variant mt-0.5">{stat.label}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Sync Status + Soft Deletes */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
              {/* Device Sync Status */}
              <div className="clay-card bg-white p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-syne text-lg font-bold text-structural flex items-center gap-2">
                    <Monitor size={18} />
                    Device Sync Status
                  </h3>
                  <span className="clay-chip bg-canvas text-on-surface-variant px-2.5 py-0.5 text-[10px]">
                    {data.devices_total} DEVICES
                  </span>
                </div>

                {data.devices_total === 0 ? (
                  <p className="text-on-surface-variant text-sm font-jakarta">
                    No devices have checked in yet.
                  </p>
                ) : (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <CheckCircle size={16} className="text-mint" />
                      <span className="font-jakarta text-sm">
                        <span className="font-bold text-mint">{data.devices_up_to_date}</span> devices up to date
                      </span>
                    </div>
                    <div className="flex items-center gap-3">
                      <AlertCircle size={16} className="text-gold" />
                      <span className="font-jakarta text-sm">
                        <span className="font-bold text-gold-dark">{data.devices_behind}</span> devices behind
                      </span>
                    </div>
                    {/* Progress bar */}
                    <div className="w-full h-3 bg-canvas rounded-full border-2 border-structural overflow-hidden">
                      <div
                        className="h-full bg-mint transition-all duration-500"
                        style={{
                          width: `${data.devices_total > 0 ? (data.devices_up_to_date / data.devices_total) * 100 : 0}%`,
                        }}
                      ></div>
                    </div>
                  </div>
                )}
              </div>

              {/* Content Status */}
              <div className="clay-card bg-white p-6">
                <h3 className="font-syne text-lg font-bold text-structural flex items-center gap-2 mb-4">
                  <FileText size={18} />
                  Content Status
                </h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="font-jakarta text-sm">Active content</span>
                    <span className="clay-chip bg-mint text-structural px-2.5 py-0.5 text-[10px]">
                      {data.active_assets}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="font-jakarta text-sm">Pending deletion</span>
                    <span className="clay-chip bg-gold text-structural px-2.5 py-0.5 text-[10px]">
                      {data.soft_deleted_assets}
                    </span>
                  </div>
                  {data.last_sync_timestamp && (
                    <div className="flex items-center gap-2 pt-2 border-t border-canvas-dim">
                      <Clock size={14} className="text-on-surface-variant" />
                      <span className="text-on-surface-variant text-xs font-jakarta">
                        Last manifest: {formatTimestamp(data.last_sync_timestamp)}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Subject Breakdown */}
            <div className="clay-card bg-white p-6 mb-8">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-syne text-lg font-bold text-structural">Subject Breakdown</h3>
                <span className="clay-chip bg-canvas text-on-surface-variant px-2.5 py-0.5 text-[10px]">
                  {data.total_subjects} SUBJECTS
                </span>
              </div>

              {data.subject_breakdown.length === 0 ? (
                <p className="text-on-surface-variant text-sm font-jakarta">
                  No subjects found. Upload content to get started.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-jakarta">
                    <thead>
                      <tr className="border-b-2 border-structural">
                        <th className="text-left py-2 label-text text-[10px] text-on-surface-variant">Subject</th>
                        <th className="text-left py-2 label-text text-[10px] text-on-surface-variant">Grade</th>
                        <th className="text-center py-2 label-text text-[10px] text-on-surface-variant">Chapters</th>
                        <th className="text-center py-2 label-text text-[10px] text-on-surface-variant">Files</th>
                        <th className="text-right py-2 label-text text-[10px] text-on-surface-variant">Size</th>
                        <th className="text-right py-2 label-text text-[10px] text-on-surface-variant">Last Modified</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.subject_breakdown.map((subj) => (
                        <tr key={subj.id} className="border-b border-canvas-dim hover:bg-canvas/50 transition-colors">
                          <td className="py-3 font-bold text-structural">{subj.name}</td>
                          <td className="py-3 text-on-surface-variant">{subj.grade}</td>
                          <td className="py-3 text-center">{subj.chapters}</td>
                          <td className="py-3 text-center">{subj.files}</td>
                          <td className="py-3 text-right text-on-surface-variant">{subj.size_display}</td>
                          <td className="py-3 text-right text-on-surface-variant">
                            {subj.last_modified ? formatTimestamp(subj.last_modified) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Activity Feed */}
            <div className="clay-card bg-white p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-syne text-lg font-bold text-structural">Recent Activity</h3>
                <button
                  onClick={() => navigate('/teacher/activity')}
                  className="text-cobalt text-xs font-grotesk font-bold uppercase tracking-wide hover:underline"
                >
                  View All →
                </button>
              </div>

              {activity.length === 0 ? (
                <p className="text-on-surface-variant text-sm font-jakarta">
                  No activity yet. Upload your first content to get started!
                </p>
              ) : (
                <div className="space-y-3">
                  {activity.map((item) => {
                    const actionStyle = ACTION_LABELS[item.action] || { label: item.action, color: 'bg-canvas' };
                    return (
                      <div key={item.id} className="flex items-start gap-3 py-2 border-b border-canvas-dim last:border-none">
                        <span className={`clay-chip ${actionStyle.color} text-structural px-2 py-0.5 text-[9px] mt-0.5 flex-shrink-0`}>
                          {actionStyle.label}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-jakarta text-sm text-structural truncate">
                            <span className="font-bold">{item.asset_filename}</span>
                            {item.subject_name && (
                              <span className="text-on-surface-variant"> in {item.subject_name}</span>
                            )}
                          </p>
                          <p className="text-on-surface-variant text-xs mt-0.5">
                            by {item.teacher_name} · {formatTimestamp(item.timestamp)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default TeacherDashboard;
