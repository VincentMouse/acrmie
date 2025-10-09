import LoginForm from "@/components/LoginForm";
import loginHero from "@/assets/login-hero.jpg";

const Index = () => {
  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Branding */}
      <div 
        className="hidden lg:flex lg:w-1/2 relative overflow-hidden"
        style={{
          background: 'var(--gradient-brand)',
        }}
      >
        <div className="absolute inset-0 opacity-20">
          <img 
            src={loginHero} 
            alt="Sales Pipeline" 
            className="w-full h-full object-cover"
          />
        </div>
        <div className="relative z-10 flex flex-col justify-center px-16 text-white">
          <div className="mb-8">
            <h2 className="text-5xl font-bold mb-4">SalesPipeline</h2>
            <div className="w-20 h-1 bg-white/80 rounded-full"></div>
          </div>
          <h3 className="text-3xl font-semibold mb-6 leading-tight">
            Streamline your sales process<br />and close more deals
          </h3>
          <p className="text-lg text-white/90 leading-relaxed max-w-md">
            The all-in-one platform that helps sales teams manage their pipeline, 
            track opportunities, and grow revenue faster.
          </p>
          
          <div className="mt-12 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-white/90">Track deals through every stage</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-white/90">Collaborate with your team in real-time</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <span className="text-white/90">Get insights with powerful analytics</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Login Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-background">
        <LoginForm />
      </div>
    </div>
  );
};

export default Index;
