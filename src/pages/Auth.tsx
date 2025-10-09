import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@/components/LoginForm';
import { SignUpForm } from '@/components/SignUpForm';
import { useAuth } from '@/hooks/useAuth';
import loginHero from '@/assets/login-hero.jpg';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  return (
    <div className="min-h-screen flex">
      <div className="hidden lg:flex lg:w-1/2 bg-gradient-to-br from-primary via-primary-variant to-accent items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute inset-0 opacity-20">
          <img 
            src={loginHero}
            alt="Sales pipeline visualization"
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative z-10 max-w-md text-white">
          <h1 className="text-5xl font-bold mb-6">Sales Pipeline CRM</h1>
          <p className="text-lg opacity-90 mb-8">
            Streamline your lead management, track your sales pipeline, and convert more opportunities into revenue.
          </p>
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">✓</div>
              <span>Multi-funnel lead ingestion & attribution</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">✓</div>
              <span>7-stage pipeline management</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center">✓</div>
              <span>Role-based access control</span>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-foreground mb-2">
              {isLogin ? 'Welcome Back' : 'Create Account'}
            </h2>
            <p className="text-muted-foreground">
              {isLogin 
                ? 'Sign in to access your sales dashboard' 
                : 'Get started with your sales pipeline'}
            </p>
          </div>

          {isLogin ? <LoginForm /> : <SignUpForm />}

          <div className="mt-6 text-center">
            <button
              onClick={() => setIsLogin(!isLogin)}
              className="text-sm text-primary hover:text-primary-glow transition-colors"
            >
              {isLogin 
                ? "Don't have an account? Sign up" 
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
