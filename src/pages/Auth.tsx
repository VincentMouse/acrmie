import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoginForm } from '@/components/LoginForm';
import { SignUpForm } from '@/components/SignUpForm';
import { useAuth } from '@/hooks/useAuth';

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
    <div className="min-h-screen flex items-center justify-center p-8 bg-background">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            {isLogin ? 'Welcome Back' : 'Create Account'}
          </h2>
          <p className="text-muted-foreground">
            {isLogin 
              ? 'Sign in to access your dashboard' 
              : 'Get started with your account'}
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
  );
}
