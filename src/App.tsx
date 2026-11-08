import React, { useState, useEffect } from 'react';
import { 
  Camera, 
  Rocket, 
  Satellite, 
  Sparkles, 
  Users, 
  Award, 
  Telescope,
  Radio,
  Orbit,
  Mail,
  Github,
  Twitter,
  Linkedin,
  Check,
  RotateCcw,
  Send,
  Instagram
} from 'lucide-react';
import { SpaceBackground } from './components/SpaceBackground';
import { StampLabel } from './components/StampLabel';
import { MissionCard } from './components/MissionCard';
import { BrutalistButton } from './components/BrutalistButton';
import { BrutalistInput } from './components/BrutalistInput';
import { BrutalistTextarea } from './components/BrutalistTextarea';
import founderImage from './Abdalalh.jpeg';
import spacepointLogo from './spacepoint-logo.png';


interface SatelliteInfo {
  satId: string;
  boothName?: string;
  status: string;
  cameraReady: boolean;
  lastSeen: number;
}

export default function App() {
  const [email, setEmail] = useState('');
  const [photoTaken, setPhotoTaken] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');
  const [contactForm, setContactForm] = useState({ name: '', email: '', message: '' });
  
  const [requestId, setRequestId] = useState<string | null>(null);
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);
  const [isSending, setIsSending] = useState(false);

  // Auto-discovery state
  const [satellites, setSatellites] = useState<SatelliteInfo[]>([]);
  const [selectedSatId, setSelectedSatId] = useState<string>('');

  // Poll for online satellites every 5 seconds
  useEffect(() => {
    const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
    const fetchSatellites = async () => {
      try {
        const res = await fetch(`${apiUrl}/api/satellites`);
        const data = await res.json();
        if (data.success && data.satellites) {
          setSatellites(data.satellites);
          
          // Auto-select the first satellite if none is selected yet
          if (!selectedSatId && data.satellites.length > 0) {
            setSelectedSatId(data.satellites[0].satId);
          }
          // If the selected satellite went offline, clear selection
          if (selectedSatId && !data.satellites.find((s: SatelliteInfo) => s.satId === selectedSatId)) {
            setSelectedSatId(data.satellites.length > 0 ? data.satellites[0].satId : '');
          }
        }
      } catch {
        // silently retry on next interval
      }
    };
    fetchSatellites();
    const interval = setInterval(fetchSatellites, 5000);
    return () => clearInterval(interval);
  }, [selectedSatId]);

  const handleTakePhoto = async () => {
    if (!email || !email.includes('@')) {
      setStatusMessage('⚠ Please enter a valid email address');
      return;
    }

    setPhotoTaken(false);
    setImageBase64(null);
    setIsRequesting(true);
    if (!selectedSatId) {
      setStatusMessage('⚠ No satellite is online. Please wait for a CubeSat to connect.');
      return;
    }

    setStatusMessage('⏳ Request sent. Waiting for the CubeSat to capture your photo...');

    const satId = selectedSatId;

    try {
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/take-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, satId })
      });
      
      const data = await response.json();
      
      if (response.ok && data.success && data.imageBase64) {
        setImageBase64(data.imageBase64);
        setRequestId(data.requestId);
        setPhotoTaken(true);
        setStatusMessage('✅ Photo captured! Preview it below. If you like it, click Save & Send.');
      } else {
        setStatusMessage('❌ Capture failed: ' + (data.error || 'Unknown error'));
      }
    } catch (error: any) {
      console.error("Backend Error:", error);
      setStatusMessage('❌ Network error. Ensure the backend server is running.');
    } finally {
      setIsRequesting(false);
    }
  };

  const handleRetake = () => {
    setPhotoTaken(false);
    setImageBase64(null);
    setStatusMessage('');
    setRequestId(null);
    setIsRequesting(false);
  };

  const handleSaveAndSend = async () => {
    if (!email || !requestId || !imageBase64) {
      setStatusMessage('⚠ No photo available yet. Please request a photo first.');
      return;
    }

    try {
      setIsSending(true);
      setStatusMessage('⏳ Sending email...');
      
      const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const response = await fetch(`${apiUrl}/api/send-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, imageBase64, requestId }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setStatusMessage('✅ Email sent! Check your inbox.');
      } else {
        setStatusMessage('❌ Failed to send: ' + (data.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error sending email:', error);
      setStatusMessage('❌ Network error. Please try again.');
    } finally {
      setIsSending(false);
    }
  };

  const handleContactSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    alert('Message sent! (This is a demo)');
    setContactForm({ name: '', email: '', message: '' });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0a0118] via-[#1a0a2e] to-[#0a0118] grain-texture relative">
      <SpaceBackground />
      
      {/* Header */}
      <header className="relative z-10 border-b-[4px] border-dashed border-purple-800/50 bg-purple-950/20 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-purple-600 border-[3px] border-purple-400 flex items-center justify-center">
                <Camera className="text-purple-100" size={24} strokeWidth={3} />
              </div>
              <img src={spacepointLogo} alt="SpacePoint" className="h-10 object-contain" />
            </div>
            
            <nav className="flex flex-wrap items-center gap-4 sm:gap-6">
              <a href="#about" className="text-purple-300 hover:text-purple-100 transition-colors uppercase text-sm tracking-wider">
                About
              </a>
              <a href="#programs" className="text-purple-300 hover:text-purple-100 transition-colors uppercase text-sm tracking-wider">
                Programs
              </a>
              <a href="#founder" className="text-purple-300 hover:text-purple-100 transition-colors uppercase text-sm tracking-wider">
                Founder
              </a>
              <a href="#contact" className="text-purple-300 hover:text-purple-100 transition-colors uppercase text-sm tracking-wider">
                Contact
              </a>
              <BrutalistButton variant="primary" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
                Take a Photo
              </BrutalistButton>
            </nav>
          </div>
        </div>
      </header>

      {/* Hero / Photo Booth Section */}
      <section className="relative z-10 py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-start">
            {/* Left Side - Photo Booth */}
            <div className="space-y-6">
              <div className="relative inline-block">
                <StampLabel text="LIVE NOW" variant="accent" rotation={-2} />
              </div>
              
              <h2 className="poster-font text-5xl sm:text-7xl lg:text-8xl text-purple-100 leading-tight glow-purple">
                CUBESAT<br />PHOTO<br />BOOTH
              </h2>
              
              <p className="text-xl sm:text-2xl text-purple-300/90 max-w-xl">
                Enter your email, preview your photo, then save & send it.
              </p>
              
              <div className="space-y-4 max-w-xl">
                {/* Satellite Selector — auto-populated from live heartbeats */}
                <div className="relative">
                  <label className="block text-purple-400 uppercase tracking-wider text-xs mb-2">
                    {'🛰️ Select Satellite ' + (satellites.length > 0 ? `(${satellites.length} online)` : '(scanning...)')}
                  </label>
                  {satellites.length === 0 ? (
                    <div className="p-3 bg-purple-900/20 border-[3px] border-dashed border-purple-700/40 text-purple-400 text-sm flex items-center gap-2">
                      <span className="inline-block w-2 h-2 rounded-full bg-yellow-500 animate-pulse"></span>
                      Scanning for satellites... Make sure your CubeSat is powered on.
                    </div>
                  ) : (
                    <div className="relative">
                      <select
                        id="satellite-selector"
                        value={selectedSatId}
                        onChange={(e) => setSelectedSatId(e.target.value)}
                        className="w-full p-3 bg-purple-950/60 border-[3px] border-dashed border-purple-600 text-purple-100 uppercase tracking-wider text-sm cursor-pointer focus:outline-none focus:border-purple-400 transition-colors pr-10 appearance-none"
                      >
                        {satellites.map((sat) => (
                          <option key={sat.satId} value={sat.satId} className="bg-[#1a0a2e] text-purple-100">
                            🟢 {sat.boothName || sat.satId} ({sat.satId}) {sat.cameraReady ? '📷' : '⚠️ no cam'}
                          </option>
                        ))}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center px-4 pointer-events-none text-purple-400">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M19 9l-7 7-7-7"></path>
                        </svg>
                      </div>
                    </div>
                  )}
                </div>

                <BrutalistInput
                  type="email"
                  placeholder="your.email@space.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
                
                <BrutalistButton 
                  variant="primary" 
                  onClick={handleTakePhoto}
                  className="w-full sm:w-auto"
                  disabled={isRequesting || satellites.length === 0}
                >
                  {isRequesting ? '⏳ Requesting...' : satellites.length === 0 ? '🔍 Waiting for Satellite...' : '📸 Take My Space Picture'}
                </BrutalistButton>
                
                {statusMessage && (
                  <div className="mt-4 p-4 bg-purple-900/30 border-[3px] border-dashed border-purple-600 text-purple-200">
                    {statusMessage}
                  </div>
                )}
              </div>
            </div>

            {/* Right Side - How It Works */}
            <div className="space-y-6">
              <h3 className="poster-font text-3xl sm:text-4xl text-purple-100 uppercase">
                How It Works
              </h3>
              
              <div className="space-y-4">
                <div className="bg-purple-950/40 border-[4px] border-dashed border-purple-700/60 p-6 card-rotate-1">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-purple-600 border-[3px] border-purple-400 flex items-center justify-center flex-shrink-0">
                      <span className="poster-font text-2xl text-purple-100">1</span>
                    </div>
                    <div>
                      <h4 className="text-xl text-purple-100 mb-2 uppercase tracking-wide">Enter Email</h4>
                      <p className="text-purple-300/80">Provide your email to receive your space photo</p>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-950/40 border-[4px] border-dashed border-purple-700/60 p-6">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-purple-600 border-[3px] border-purple-400 flex items-center justify-center flex-shrink-0">
                      <span className="poster-font text-2xl text-purple-100">2</span>
                    </div>
                    <div>
                      <h4 className="text-xl text-purple-100 mb-2 uppercase tracking-wide">Preview</h4>
                      <p className="text-purple-300/80">See your photo captured by our CubeSat</p>
                    </div>
                  </div>
                </div>

                <div className="bg-purple-950/40 border-[4px] border-dashed border-purple-700/60 p-6 card-rotate-2">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 bg-purple-600 border-[3px] border-purple-400 flex items-center justify-center flex-shrink-0">
                      <span className="poster-font text-2xl text-purple-100">3</span>
                    </div>
                    <div>
                      <h4 className="text-xl text-purple-100 mb-2 uppercase tracking-wide">Save & Send</h4>
                      <p className="text-purple-300/80">Download and share your cosmic moment</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Photo Preview Section */}
      {photoTaken && (
        <section className="relative z-10 py-12 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto">
            <div className="relative bg-purple-950/40 border-[4px] border-dashed border-purple-600 p-6 sm:p-8">
              <div className="absolute -top-6 -right-6">
                <div className="bg-purple-600 border-[3px] border-purple-400 px-4 py-2 rotate-12">
                  <span className="poster-font text-xl text-purple-100 uppercase">Mission Ready ✓</span>
                </div>
              </div>
              
              <div className="relative overflow-hidden aspect-video bg-gradient-to-br from-purple-900/50 to-purple-950/50 border-[3px] border-dashed border-purple-700 mb-6 flex items-center justify-center">
                <div className="text-center">
                  <Satellite size={64} className="text-purple-500/50 mx-auto mb-4" />
                  <p className="text-purple-400">[ YOUR CUBESAT PHOTO ]</p>
                  {imageBase64 && (
                    <img 
                      src={imageBase64} 
                      alt="Captured from Space" 
                      className="absolute inset-0 w-full h-full object-cover"
                    />
                  )}
                </div>
              </div>
              
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <BrutalistButton variant="outline" onClick={handleRetake}>
                  <RotateCcw size={18} className="inline mr-2" />
                  Retake
                </BrutalistButton>
                <BrutalistButton variant="primary" onClick={handleSaveAndSend}>
                  <Send size={18} className="inline mr-2" />
                  Save & Send
                </BrutalistButton>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* About Us Section */}
      <section id="about" className="relative z-10 py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="relative bg-purple-950/40 border-[4px] border-dashed border-purple-700/60 p-8 sm:p-12 card-rotate-1">
            <div className="absolute -top-4 left-8">
              <StampLabel text="ABOUT US" variant="primary" rotation={-1} />
            </div>
            
            <div className="mt-6 space-y-6">
              <h3 className="poster-font text-4xl sm:text-5xl text-purple-100 uppercase">
                Making Space Accessible
              </h3>
              
              <p className="text-lg sm:text-xl text-purple-300/90 max-w-3xl leading-relaxed">
                SpacePoint “SPACE.” is an EdTech startup revolutionizing STEM education by providing educational satellite development kits and tailored programs that empower students, from middle school to university level, to explore their interests, identify career paths, and enhance their academic performance in STEM fields.
              </p>
              
              <div className="flex flex-wrap gap-4 mt-8">
                <div className="inline-block">
                  <StampLabel text="EST. 2023" variant="secondary" rotation={2} />
                </div>
                <div className="inline-block">
                  <StampLabel text="Student Led" variant="accent" rotation={-1} />
                </div>
                <div className="inline-block">
                  <StampLabel text="Global Mission" variant="primary" rotation={1} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Programs We Do */}
      <section id="programs" className="relative z-10 py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="poster-font text-5xl sm:text-6xl text-purple-100 uppercase glow-purple mb-4">
              Programs We Do
            </h3>
            <p className="text-xl text-purple-300/80">Exploring the cosmos through innovation</p>
          </div>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            <MissionCard
              icon={Satellite}
              title="CubeSat Photo Booth"
              description="Interactive satellite photography for events and exhibitions"
              rotation={-1}
            />
            <MissionCard
              icon={Rocket}
              title="Satellite Education Programs"
              description="Educational CubeSat building and launch experiences"
              rotation={0.5}
            />
            <MissionCard
              icon={Telescope}
              title="Lab Setup"
              description="Satellite Technology Lab Setup"
              rotation={-0.5}
            />
            <MissionCard
              icon={Users}
              title="Student Missions"
              description="Hands-on satellite development for student teams"
              rotation={1}
            />
            <MissionCard
              icon={Radio}
              title="Ground Stations"
              description="Building community satellite tracking stations"
              rotation={-0.5}
            />
            <MissionCard
              icon={Award}
              title="Space Challenges"
              description="Competitions and hackathons for space innovators"
              rotation={0.5}
            />
          </div>
        </div>
      </section>

      {/* Founder Section */}
      <section id="founder" className="relative z-10 py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="relative bg-purple-950/40 border-[4px] border-dashed border-purple-700/60 p-8 sm:p-12 card-rotate-2">
            <div className="absolute -top-4 right-8">
              <StampLabel text="FOUNDER" variant="accent" rotation={3} />
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-start mt-6">
              <div className="md:col-span-1">
                <div className="aspect-square border-[3px] border-dashed border-purple-700 overflow-hidden">
                  <img 
                    src={founderImage} 
                    alt="Founder" 
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
              
              <div className="md:col-span-2 space-y-4">
                <h3 className="poster-font text-3xl sm:text-4xl text-purple-100 uppercase">
                  Abdullah AlSalmani
                </h3>
                <p className="text-purple-400 uppercase tracking-wider text-sm">Co-Founder & CEO</p>
                
                <p className="text-purple-300/90 leading-relaxed">
                  Abdullah AlSalmani is the Co-Founder & CEO of SpacePoint “SPACE.”, a UAE-based EdTech startup making satellite development accessible to students from middle school through university. An electrical engineer with an MSc in Space Science and an MIT Bootcamps alumnus, Abdullah is also the system engineer behind AlAinSat-1, the first satellite built in Al Ain, where he led the development of an onboard computer flown on it too, as a payload. Passionate about innovation, youth empowerment, and climate action, he served on the Youth Advisory Council of the Al Ghurair Foundation. His contributions to education and space have earned him recognition as one of the Top 25 STEM & Space Educators for Climate, a Young Arab Pioneer, and a finalist for the Emerging Founders Award at SEF2024.
                </p>
                
                <p className="text-purple-300/90 leading-relaxed">
                  "Space shouldn't just be something we look at. It should be something we can touch, 
                  build, and share together."
                </p>
                
                <div className="pt-4">
                  <p className="text-purple-400 font-handwriting text-xl italic">— Abdullah AlSalmani</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Contact Section */}
      <section id="contact" className="relative z-10 py-12 sm:py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h3 className="poster-font text-5xl sm:text-6xl text-purple-100 uppercase glow-purple mb-4">
              Get In Touch
            </h3>
            <p className="text-xl text-purple-300/80">Have a question or want to collaborate?</p>
          </div>
          
          <div className="relative bg-purple-950/40 border-[4px] border-dashed border-purple-700/60 p-8 sm:p-12">
            <form onSubmit={handleContactSubmit} className="space-y-6">
              <div>
                <label className="block text-purple-300 uppercase tracking-wider text-sm mb-2">
                  Name
                </label>
                <BrutalistInput
                  type="text"
                  placeholder="Your name"
                  value={contactForm.name}
                  onChange={(e) => setContactForm({ ...contactForm, name: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-purple-300 uppercase tracking-wider text-sm mb-2">
                  Email
                </label>
                <BrutalistInput
                  type="email"
                  placeholder="your.email@example.com"
                  value={contactForm.email}
                  onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
                />
              </div>
              
              <div>
                <label className="block text-purple-300 uppercase tracking-wider text-sm mb-2">
                  Message
                </label>
                <BrutalistTextarea
                  placeholder="Tell us about your project or question..."
                  rows={6}
                  value={contactForm.message}
                  onChange={(e) => setContactForm({ ...contactForm, message: e.target.value })}
                />
              </div>
              
              <BrutalistButton type="submit" variant="primary" className="w-full sm:w-auto">
                <Mail size={18} className="inline mr-2" />
                Send Message
              </BrutalistButton>
            </form>
            
            <div className="mt-12 pt-8 border-t-[3px] border-dashed border-purple-700">
              <p className="text-purple-400 uppercase tracking-wider text-sm mb-4">
                Follow Our Mission
              </p>
              <div className="flex flex-wrap gap-4">
                
                <a href="https://www.instagram.com/spacepoint.ae/" className="p-3 bg-purple-900/30 border-[3px] border-dashed border-purple-700 hover:border-purple-500 transition-colors">
                  <Instagram size={24} className="text-purple-400" />
                </a>
  
                <a href="https://www.linkedin.com/company/spacepointae/" className="p-3 bg-purple-900/30 border-[3px] border-dashed border-purple-700 hover:border-purple-500 transition-colors">
                  <Linkedin size={24} className="text-purple-400" />
                </a>
                <a href="mailto:abdel.alsalmani@gmail.com" className="p-3 bg-purple-900/30 border-[3px] border-dashed border-purple-700 hover:border-purple-500 transition-colors">
                  <Mail size={24} className="text-purple-400" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t-[4px] border-dashed border-purple-800/50 bg-purple-950/20 backdrop-blur-sm py-8 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-600 border-[3px] border-purple-400 flex items-center justify-center">
                <Camera className="text-purple-100" size={20} strokeWidth={3} />
              </div>
              <span className="text-purple-300 text-sm">
                © 2026 SpacePoint. Making space accessible.
              </span>
            </div>
            
            <div className="flex flex-wrap gap-6 text-sm">
              <a href="#" className="text-purple-400 hover:text-purple-200 transition-colors uppercase tracking-wider">
                Privacy
              </a>
              <a href="#" className="text-purple-400 hover:text-purple-200 transition-colors uppercase tracking-wider">
                Terms
              </a>
              <a href="#" className="text-purple-400 hover:text-purple-200 transition-colors uppercase tracking-wider">
                Mission Log
              </a>
            </div>
          </div>
          
          <div className="mt-6 flex justify-center opacity-10">
            <div className="flex gap-4">
              <Sparkles size={16} className="text-purple-400" />
              <Orbit size={16} className="text-purple-400" />
              <Satellite size={16} className="text-purple-400" />
              <Rocket size={16} className="text-purple-400" />
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
