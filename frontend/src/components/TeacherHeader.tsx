import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { LogOut, LayoutDashboard, Upload, List, Activity, ChevronRight } from 'lucide-react';
import api from '../api';

const TeacherHeader = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const teacherName = localStorage.getItem('teacher_name') || 'Teacher';

  const handleLogout = async () => {
    try {
      await api.post('teacher/logout/');
    } catch { /* ignore */ }
    localStorage.removeItem('teacher_name');
    localStorage.removeItem('teacher_id');
    localStorage.removeItem('teacher_admin');
    navigate('/teacher');
  };

  const navItems = [
    { label: 'Dashboard', path: '/teacher/dashboard', icon: LayoutDashboard },
    { label: 'Content', path: '/teacher/content', icon: List },
    { label: 'Upload', path: '/teacher/content/upload', icon: Upload },
    { label: 'Activity', path: '/teacher/activity', icon: Activity },
  ];

  const getBreadcrumbs = (): { label: string; path?: string }[] => {
    const crumbs: { label: string; path?: string }[] = [];
    const path = location.pathname;

    if (path === '/teacher/dashboard') {
      crumbs.push({ label: 'Dashboard' });
    } else if (path === '/teacher/content/upload') {
      crumbs.push({ label: 'Dashboard', path: '/teacher/dashboard' });
      crumbs.push({ label: 'Upload Content' });
    } else if (path === '/teacher/content') {
      crumbs.push({ label: 'Dashboard', path: '/teacher/dashboard' });
      crumbs.push({ label: 'Content Library' });
    } else if (path === '/teacher/activity') {
      crumbs.push({ label: 'Dashboard', path: '/teacher/dashboard' });
      crumbs.push({ label: 'Activity Log' });
    }
    return crumbs;
  };

  const breadcrumbs = getBreadcrumbs();

  return (
    <header className="header-bar">
      <div className="header-inner">
        {/* Left: Logo + Breadcrumbs */}
        <div className="header-left">
          <button
            onClick={() => navigate('/teacher/dashboard')}
            className="header-logo-btn"
            aria-label="Go to Teacher Dashboard"
          >
            <span className="header-logo-text">ORBIS</span>
            <span className="teacher-portal-badge">TEACHER</span>
          </button>

          {breadcrumbs.length > 0 && (
            <nav className="header-breadcrumbs" aria-label="Breadcrumb">
              {breadcrumbs.map((crumb, i) => (
                <span key={i} className="header-crumb-item">
                  <ChevronRight size={14} className="header-crumb-sep" />
                  {crumb.path ? (
                    <button
                      onClick={() => navigate(crumb.path!)}
                      className="header-crumb-link"
                    >
                      {crumb.label}
                    </button>
                  ) : (
                    <span className="header-crumb-current">{crumb.label}</span>
                  )}
                </span>
              ))}
            </nav>
          )}
        </div>

        {/* Right: Nav + Avatar + Logout */}
        <div className="header-right">
          {/* Desktop nav links */}
          <nav className="teacher-nav-links">
            {navItems.map((item) => {
              const isActive = location.pathname === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className={`teacher-nav-item ${isActive ? 'teacher-nav-active' : ''}`}
                >
                  <item.icon size={14} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Teacher info + Logout */}
          <div className="teacher-user-pill">
            <div className="header-avatar bg-cobalt">
              <span className="text-white text-xs font-bold">
                {teacherName.charAt(0).toUpperCase()}
              </span>
            </div>
            <span className="teacher-user-name">{teacherName}</span>
            <button
              onClick={handleLogout}
              className="teacher-logout-btn"
              title="Logout"
            >
              <LogOut size={14} />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default TeacherHeader;
