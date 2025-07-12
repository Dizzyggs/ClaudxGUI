import React from 'react';
import './WelcomeScreen.scss';

interface WelcomeScreenProps {
  onNewProject?: () => void;
  onOpenRecent?: () => void;
}

const WelcomeScreen: React.FC<WelcomeScreenProps> = ({ onNewProject, onOpenRecent }) => {
  return (
    <div className="welcome-screen">
      <div className="welcome-screen__content">
        <div className="welcome-screen__hero">
          <div className="welcome-screen__icon">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <h1 className="welcome-screen__title">Claude Code GUI</h1>
          <p className="welcome-screen__subtitle">Intelligent Code Assistant</p>
        </div>
        
        <div className="welcome-screen__description">
          <p>Start by creating a new project or selecting from your recent work.</p>
        </div>
        
        <div className="welcome-screen__actions">
          <button className="welcome-screen__button welcome-screen__button--primary" onClick={onNewProject}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 5V19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M5 12H19" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            New Project
          </button>
          <button className="welcome-screen__button welcome-screen__button--secondary" onClick={onOpenRecent}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9 2H5C3.89543 2 3 2.89543 3 4V8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M21 12V8C21 6.89543 20.1046 6 19 6H15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3 16V20C3 21.1046 3.89543 22 5 22H9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M15 22H19C20.1046 22 21 21.1046 21 20V16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Open Recent
          </button>
        </div>
        
        <div className="welcome-screen__features">
          <div className="welcome-screen__feature">
            <div className="welcome-screen__feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 2L3 14H12L11 22L21 10H12L13 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>Claude Powered</h3>
            <p>Get intelligent code suggestions and assistance</p>
          </div>
          <div className="welcome-screen__feature">
            <div className="welcome-screen__feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M14 9V5C14 3.89543 13.1046 3 12 3C10.8954 3 10 3.89543 10 5V9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3 9H21L20 19C20 20.1046 19.1046 21 18 21H6C4.89543 21 4 20.1046 4 19L3 9Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>Project Management</h3>
            <p>Organize and manage your coding projects</p>
          </div>
          <div className="welcome-screen__feature">
            <div className="welcome-screen__feature-icon">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 15C21 15.5304 20.7893 16.0391 20.4142 16.4142C20.0391 16.7893 19.5304 17 19 17H7L3 21V5C3 4.46957 3.21071 3.96086 3.58579 3.58579C3.96086 3.21071 4.46957 3 5 3H19C19.5304 3 20.0391 3.21071 20.4142 3.58579C20.7893 3.96086 21 4.46957 21 5V15Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <h3>Interactive Chat</h3>
            <p>Chat with Claude about your code and projects</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WelcomeScreen;