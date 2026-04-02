const departments = [
  "Computer Science",
  "Electronics",
  "Mechanical",
  "Civil",
  "Electrical",
  "Information Technology",
];
const categories = [
  "Workshop",
  "Seminar",
  "Hackathon",
  "Cultural",
  "Sports",
  "Technical",
  "Guest Lecture",
];

let faceModelsLoaded = false;
let isScanning = false;
let isEnrolling = false;
let enrollmentDescriptor = null;
let loginStream = null;
let enrollStream = null;

async function loadFaceModels() {
  if (faceModelsLoaded) return true;
  try {
    const MODEL_URL = "https://raw.githubusercontent.com/vladmandic/face-api/master/model/";
    console.log("Starting to load face models...");
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    faceModelsLoaded = true;
    console.log("Face Models Loaded Successfully");
    return true;
  } catch (error) {
    console.error("Error loading face models:", error);
    return false;
  }
}

async function startFaceLogin() {
  if (!selectedRole) {
    showToast("Please select a role first", "error");
    return;
  }

  const container = document.getElementById("faceIdLoginContainer");
  const manual = document.getElementById("manualLoginContainer");
  const video = document.getElementById("loginVideo");
  const status = document.getElementById("loginFaceStatus");
  const scanLine = document.getElementById("loginScanLine");
  const canvas = document.getElementById("loginCanvas");

  const confBar = document.getElementById("confidenceBar");
  const confText = document.getElementById("faceConfidence");
  const countdownOverlay = document.getElementById("countdownCircle");
  const countdownText = document.getElementById("countdownText");

  if (confBar) confBar.style.width = "0%";
  if (confText) confText.textContent = "0%";
  if (countdownOverlay) countdownOverlay.style.display = "none";
  if (countdownText) countdownText.textContent = "3%";
  if (canvas) canvas.getContext("2d").clearRect(0, 0, canvas.width, canvas.height);
  document.getElementById("loginScannerContainer").classList.remove("face-detected");

  manual.style.display = "none";
  container.style.display = "block";
  status.textContent = "Initializing Biometrics...";

  const modelsReady = await loadFaceModels();
  if (!modelsReady) {
    showToast("Biometric models failed to load", "error");
    toggleManualLogin();
    return;
  }

  try {
    loginStream = await navigator.mediaDevices.getUserMedia({ 
      video: { width: 640, height: 480, frameRate: { ideal: 30 } } 
    });
    video.srcObject = loginStream;
    scanLine.style.display = "block";
    
    status.textContent = "Detecting face...";
    isScanning = true;
    
    video.onloadedmetadata = () => {
      video.play();
      performFaceLogin(video, status);
    };
  } catch (err) {
    console.error(err);
    showToast("Webcam access denied", "error");
    toggleManualLogin();
  }
}

async function performFaceLogin(video, status) {
  if (!isScanning) return;

  const canvas = document.getElementById("loginCanvas");
  const container = document.getElementById("loginScannerContainer");
  const confBar = document.getElementById("confidenceBar");
  const confText = document.getElementById("faceConfidence");

  if (video.paused || video.ended || video.readyState < 2) {
    requestAnimationFrame(() => performFaceLogin(video, status));
    return;
  }

  try {
    const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();

    if (detections) {
      container.classList.add("face-detected");
      status.textContent = "Analyzing features...";
      
      const displaySize = { width: video.offsetWidth, height: video.offsetHeight };
      faceapi.matchDimensions(canvas, displaySize);
      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      
      const box = resizedDetections.detection.box;
      const drawBox = new faceapi.draw.DrawBox(box, { 
        label: 'SCANNING', 
        boxColor: '#6c5ce7',
        lineWidth: 2
      });
      drawBox.draw(canvas);
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

      const score = Math.round(detections.detection.score * 100);
      if (confBar) confBar.style.width = score + "%";
      if (confText) confText.textContent = score + "%";

      if (score > 65) {
        status.textContent = "Matching identity...";
        
        const res = await fetch("http://localhost:5000/login-face", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ faceDescriptor: Array.from(detections.descriptor) })
        });

        const data = await res.json();

        if (res.ok && data.user) {
          if (data.user.role !== selectedRole) {
            status.textContent = "Role Mismatch";
            status.classList.add("color-warning");
            setTimeout(() => {
              if (isScanning) {
                status.classList.remove("color-warning");
                performFaceLogin(video, status);
              }
            }, 2000);
            return;
          }

          isScanning = false;
          status.textContent = "Verified";
          status.classList.add("color-primary");

          const countdownOverlay = document.getElementById("countdownCircle");
          const countdownText = document.getElementById("countdownText");
          if (countdownOverlay) countdownOverlay.style.display = "flex";
          
          let count = 3;
          const timer = setInterval(() => {
              count--;
              if (countdownText) countdownText.textContent = count;
              if (count <= 0) {
                  clearInterval(timer);
                  stopStream(loginStream);
                  currentUser = data.user;
                  localStorage.setItem("campusUser", JSON.stringify(data.user));
                  showPage(selectedRole);
              }
          }, 1000);

        } else {
          status.textContent = "Not recognized";
          status.classList.add("color-warning");
          setTimeout(() => {
            if (isScanning) {
              status.classList.remove("color-warning");
              performFaceLogin(video, status);
            }
          }, 1000);
        }
      } else {
        requestAnimationFrame(() => performFaceLogin(video, status));
      }
    } else {
      container.classList.remove("face-detected");
      status.textContent = "Position your face";
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      if (confBar) confBar.style.width = "0%";
      if (confText) confText.textContent = "0%";
      requestAnimationFrame(() => performFaceLogin(video, status));
    }
  } catch (err) {
    console.error("Face Login Error:", err);
    status.textContent = "System error";
    setTimeout(() => {
      if (isScanning) performFaceLogin(video, status);
    }, 2000);
  }
}

function toggleManualLogin() {
  isScanning = false;
  stopStream(loginStream);
  document.getElementById("faceIdLoginContainer").style.display = "none";
  document.getElementById("manualLoginContainer").style.display = "block";
}

async function toggleFaceEnroll() {
  const container = document.getElementById("faceIdEnrollContainer");
  const btn = document.getElementById("toggleEnrollBtn");
  const video = document.getElementById("enrollVideo");
  const status = document.getElementById("enrollFaceStatus");
  const captureBtn = document.getElementById("enrollFaceBtn");
  const canvas = document.getElementById("enrollCanvas");

  if (container.style.display === "none") {
    container.style.display = "block";
    btn.innerHTML = '<i class="fa-solid fa-xmark mr-2"></i> Cancel Face Setup';
    
    status.textContent = "Initializing camera...";
    const modelsReady = await loadFaceModels();
    if (!modelsReady) {
      showToast("Biometric models failed to load", "error");
      return;
    }

    try {
      enrollStream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: 640, height: 480 } 
      });
      video.srcObject = enrollStream;
      isEnrolling = true;
      
      video.onloadedmetadata = () => {
        video.play();
        performEnrollDetection(video, canvas, status, captureBtn);
      };
    } catch (err) {
      showToast("Webcam access denied", "error");
      container.style.display = "none";
    }
  } else {
    isEnrolling = false;
    container.style.display = "none";
    btn.innerHTML = '<i class="fa-solid fa-face-viewfinder mr-2"></i> Add Face ID (Recommended)';
    stopStream(enrollStream);
  }
}

async function performEnrollDetection(video, canvas, status, captureBtn) {
  if (!isEnrolling) return;

  if (video.paused || video.ended || video.readyState < 2) {
    requestAnimationFrame(() => performEnrollDetection(video, canvas, status, captureBtn));
    return;
  }

  try {
    const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 224, scoreThreshold: 0.5 })).withFaceLandmarks();

    const displaySize = { width: video.offsetWidth, height: video.offsetHeight };
    faceapi.matchDimensions(canvas, displaySize);

    if (detections) {
      const resizedDetections = faceapi.resizeResults(detections, displaySize);
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      
      const box = resizedDetections.detection.box;
      const drawBox = new faceapi.draw.DrawBox(box, { 
        label: 'READY', 
        boxColor: '#22c55e',
        lineWidth: 2
      });
      drawBox.draw(canvas);
      faceapi.draw.drawFaceLandmarks(canvas, resizedDetections);

      if (!enrollmentDescriptor) {
        status.textContent = "Ready to capture";
        captureBtn.disabled = false;
      }
    } else {
      canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height);
      if (!enrollmentDescriptor) {
        status.textContent = "Center your face in the frame";
        captureBtn.disabled = true;
      }
    }

    requestAnimationFrame(() => performEnrollDetection(video, canvas, status, captureBtn));
  } catch (err) {
    console.error("Enroll Detection Error:", err);
  }
}

async function enrollFace() {
  const video = document.getElementById("enrollVideo");
  const status = document.getElementById("enrollFaceStatus");
  const captureBtn = document.getElementById("enrollFaceBtn");

  status.textContent = "Extracting Biometric Map...";
  captureBtn.disabled = true;

  try {
    const detections = await faceapi.detectSingleFace(video, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 })).withFaceLandmarks().withFaceDescriptor();

    if (detections) {
      enrollmentDescriptor = Array.from(detections.descriptor);
      status.textContent = "Biometric Data Captured ✅";
      status.style.color = "var(--success)";
      captureBtn.innerHTML = "Re-capture Biometrics";
      captureBtn.disabled = false;
      showToast("Face fingerprint successfully mapped", "success");
    } else {
      status.textContent = "Error: Face not found";
      captureBtn.disabled = false;
      showToast("Please ensure your face is clearly visible", "error");
    }
  } catch (err) {
    console.error(err);
    showToast("Error capturing biometric data", "error");
    captureBtn.disabled = false;
  }
}

function stopStream(stream) {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
  }
}

async function doRegister() {
  const name = document.getElementById("regFullName").value;
  const email = document.getElementById("regFullEmail").value;
  const password = document.getElementById("regFullPassword").value;
  const role = "faculty";
  const dept = document.getElementById("regFullDept").value;
  const faceContainer = document.getElementById("faceIdEnrollContainer");

  if (!name || !email || !password) {
    showToast("Please fill all required fields", "error");
    return;
  }

  if (faceContainer && faceContainer.style.display === "block" && !enrollmentDescriptor) {
    showToast("Please capture your biometric data or cancel Face ID setup", "error");
    return;
  }

  try {
    const res = await fetch("http://localhost:5000/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name, email, password, role, 
        department: dept, 
        faceDescriptor: enrollmentDescriptor
      })
    });

    const data = await res.json();

    if (res.ok) {
      stopStream(enrollStream);
      enrollmentDescriptor = null; 
      showSuccessAnimation("Account Created Successfully", () => {
        showPage("login");
      });
    } else {
      showErrorAnimation(data.message || "Registration failed");
    }
  } catch (error) {
    console.error(error);
    showToast("Server error during registration", "error");
  }
}

async function loadEvents() {
  try {
    const response = await fetch("http://localhost:5000/events");

    const data = await response.json();

    events = data;
  } catch (error) {
    console.log("Error loading events:", error);
  }
}

const engagementTrend = [
  { month: "Sep", score: 72 },
  { month: "Oct", score: 78 },
  { month: "Nov", score: 85 },
  { month: "Dec", score: 80 },
  { month: "Jan", score: 88 },
  { month: "Feb", score: 94 },
];
const COLORS = [
  "#6c5ce7",
  "#8b5cf6",
  "#a855f7",
  "#4a6cf7",
  "#3b82f6",
  "#2dd4bf",
];
const featuresList = [
  {
    icon: "fa-calendar",
    title: "Event Creation & Registration",
    desc: "Effortlessly create, manage, and promote campus events with smart registration flows.",
  },
  {
    icon: "fa-users",
    title: "Attendance Tracking",
    desc: "Real-time attendance tracking with QR codes and digital check-ins.",
  },
  {
    icon: "fa-chart-bar",
    title: "Engagement Analytics",
    desc: "Deep insights into student engagement patterns and event performance.",
  },
];
const landingStats = [
  { label: "Total Events", value: 248 },
  { label: "Students Participated", value: 5420 },
];

let currentUser = null,
  selectedRole = null,
  currentPage = "landing",
  chartInstances = {},
  studentRegIds = [];

function createParticles(x, y, color) {
  const container = document.getElementById("confirmationOverlay");
  const particleCount = 12;
  
  for (let i = 0; i < particleCount; i++) {
    const particle = document.createElement("div");
    particle.className = "conf-particle";

    const size = Math.random() * 8 + 4;
    const destinationX = (Math.random() - 0.5) * 250;
    const destinationY = (Math.random() - 0.5) * 250;
    const rotation = Math.random() * 360;
    const delay = Math.random() * 0.2;
    
    particle.style.width = `${size}px`;
    particle.style.height = `${size}px`;
    particle.style.backgroundColor = color;
    particle.style.left = `calc(50% + ${(Math.random() - 0.5) * 20}px)`;
    particle.style.top = `calc(50% + ${(Math.random() - 0.5) * 20}px)`;
    particle.style.setProperty("--x", `${destinationX}px`);
    particle.style.setProperty("--y", `${destinationY}px`);
    
    particle.style.animation = `particle-fade-out 0.8s cubic-bezier(0.165, 0.84, 0.44, 1) ${delay}s forwards`;
    
    container.appendChild(particle);

    setTimeout(() => particle.remove(), 1200);
  }
}

function showSuccessAnimation(message, redirectUrl = null) {
  const overlay = document.getElementById("confirmationOverlay");
  const iconWrapper = document.getElementById("confirmationIcon");
  const messageEl = document.getElementById("confirmationMessage");
  const content = document.getElementById("confirmationContent");

  overlay.classList.remove("active", "conf-expand", "conf-success", "conf-error");
  void overlay.offsetWidth; 
  
  content.className = "conf-content conf-success";
  messageEl.textContent = message;
  overlay.classList.add("conf-success");

  iconWrapper.innerHTML = `
    <div class="conf-glow"></div>
    <svg class="conf-icon conf-icon-bounce" viewBox="0 0 52 52">
      <circle class="conf-icon-circle" cx="26" cy="26" r="25" fill="none"/>
      <path class="conf-icon-check" fill="none" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
    </svg>
  `;

  overlay.style.display = "flex";

  requestAnimationFrame(() => {
    overlay.classList.add("active");
  });

  setTimeout(() => {
    createParticles(window.innerWidth / 2, window.innerHeight / 2, "#22c55e");

    if (typeof confetti === "function") {
      confetti({
        particleCount: 80,
        spread: 60,
        origin: { y: 0.5 },
        colors: ["#22c55e", "#4ade80", "#ffffff"],
        zIndex: 10000
      });
    }
  }, 800);

  setTimeout(() => {
    overlay.classList.add("conf-expand");

    setTimeout(() => {
      if (typeof redirectUrl === "function") {
        redirectUrl();
      } else if (typeof redirectUrl === "string") {
        if (redirectUrl.startsWith("/")) {
           
           if (redirectUrl === "/student") showPage("student");
           else if (redirectUrl === "/faculty") showPage("faculty");
           else if (redirectUrl === "/landing") showPage("landing");
           else window.location.href = redirectUrl;
        } else {
          window.location.href = redirectUrl;
        }
      }

      setTimeout(() => {
        overlay.classList.remove("active", "conf-expand");
        setTimeout(() => {
          overlay.style.display = "none";
        }, 500);
      }, 600);
    }, 800);
  }, 2200);
}

function showErrorAnimation(message) {
  const overlay = document.getElementById("confirmationOverlay");
  const iconWrapper = document.getElementById("confirmationIcon");
  const messageEl = document.getElementById("confirmationMessage");
  const content = document.getElementById("confirmationContent");

  overlay.classList.remove("active", "conf-expand", "conf-success", "conf-error");
  void overlay.offsetWidth;
  
  content.className = "conf-content conf-error conf-error-shake";
  messageEl.textContent = message;
  overlay.classList.add("conf-error");

  iconWrapper.innerHTML = `
    <div class="conf-glow"></div>
    <svg class="conf-icon" viewBox="0 0 52 52">
      <circle class="conf-icon-circle" cx="26" cy="26" r="25" fill="none"/>
      <path class="conf-icon-cross" fill="none" d="M16 16l20 20M36 16L16 36"/>
    </svg>
  `;

  overlay.style.display = "flex";
  requestAnimationFrame(() => {
    overlay.classList.add("active");
  });

  setTimeout(() => {
    createParticles(window.innerWidth / 2, window.innerHeight / 2, "#ef4444");
  }, 800);

  setTimeout(() => {
    overlay.classList.remove("active");
    setTimeout(() => {
      overlay.style.display = "none";
    }, 500);
  }, 3000);
}

function showSuccessScreen(message, callback = null) {
  showSuccessAnimation(message, callback);
}

function showErrorScreen(message) {
  showErrorAnimation(message);
}

function showSuccess(msg, callback = null) {
  showToast(msg, "success", callback);
}

function showError(msg, callback = null) {
  showToast(msg, "error", callback);
}

function showToast(msg, type = "success", callback = null) {
  const container = document.getElementById("toastContainer");
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  
  const icon = type === "success" ? "fa-circle-check" : "fa-circle-exclamation";
  
  toast.innerHTML = `
    <i class="fa-solid ${icon}"></i>
    <div class="flex-1">${msg}</div>
    <div class="toast-close">
      <i class="fa-solid fa-xmark"></i>
    </div>
  `;
  
  container.appendChild(toast);

  const closeBtn = toast.querySelector(".toast-close");
  closeBtn.onclick = () => {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(20px)";
    setTimeout(() => toast.remove(), 400);
  };
  
  if (callback && typeof callback === "function") callback();

  setTimeout(() => {
    if (toast.parentElement) {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(20px)";
      setTimeout(() => toast.remove(), 400);
    }
  }, 4000);
}

function initTiltEffect() {
  const cards = document.querySelectorAll(".glass-card:not(.no-hover)");

  cards.forEach((card) => {
    if (card.dataset.tiltInitialized) return;
    card.dataset.tiltInitialized = "true";

    card.addEventListener("mousemove", (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left; 
      const y = e.clientY - rect.top;  

      card.style.setProperty("--mouse-x", `${x}px`);
      card.style.setProperty("--mouse-y", `${y}px`);

      const centerX = rect.width / 2;
      const centerY = rect.height / 2;

      const rotateX = ((y - centerY) / centerY) * -8;
      const rotateY = ((x - centerX) / centerX) * 8;

      gsap.to(card, {
        rotateX: rotateX,
        rotateY: rotateY,
        scale: 1.02,
        y: -5,
        duration: 0.5,
        ease: "power2.out",
        overwrite: "auto"
      });
    });

    card.addEventListener("mouseleave", () => {
      gsap.to(card, {
        rotateX: 0,
        rotateY: 0,
        scale: 1,
        y: 0,
        duration: 0.5,
        ease: "power2.out",
        overwrite: "auto"
      });
    });
  });
}

function initMagneticButtons() {
  const magneticElements = document.querySelectorAll(".btn:not([data-magnetic]), .role-btn:not([data-magnetic]), .sidebar-link:not([data-magnetic])");

  magneticElements.forEach((el) => {
    el.setAttribute("data-magnetic", "true");
    
    el.addEventListener("mousemove", function(e) {
      const pos = el.getBoundingClientRect();
      const x = e.clientX - pos.left - pos.width / 2;
      const y = e.clientY - pos.top - pos.height / 2;

      gsap.to(el, {
        x: x * 0.35,
        y: y * 0.35,
        scale: 1.05,
        duration: 0.4,
        ease: "power3.out",
        overwrite: "auto"
      });
    });

    el.addEventListener("mouseleave", function() {
      
      gsap.to(el, {
        x: 0,
        y: 0,
        scale: 1,
        duration: 0.7,
        ease: "elastic.out(1, 0.3)",
        overwrite: "auto"
      });
    });
  });
}

function showPage(page) {
  document
    .querySelectorAll(".page")
    .forEach((p) => p.classList.remove("active"));
  const el = document.getElementById("page-" + page);
  if (el) {
    el.classList.add("active");
    currentPage = page;
  }
  if (page === "landing") renderLanding();
  if (page === "student") renderStudentDashboard();
  if (page === "faculty") renderFacultyDashboard();
  if (page === "analytics") renderAnalytics();
  if (page === "leaderboard") renderLeaderboard();
  if (page === "certificates") renderCertificates();

  setTimeout(initMagneticButtons, 100);
  setTimeout(initTiltEffect, 100);
  
  window.scrollTo(0, 0);
}

function selectRole(role) {
  selectedRole = role;
  document
    .getElementById("roleStudent")
    .classList.toggle("selected", role === "student");
  document
    .getElementById("roleFaculty")
    .classList.toggle("selected", role === "faculty");
  document.getElementById("roleStudent").querySelector("i").style.color =
    role === "student" ? "var(--primary)" : "var(--muted-fg)";
  document.getElementById("roleFaculty").querySelector("i").style.color =
    role === "faculty" ? "var(--primary)" : "var(--muted-fg)";

  const btn = document.getElementById("loginBtn");
  const faceBtn = document.getElementById("faceLoginBtn");
  const registerLink = document.getElementById("registerLinkContainer");

  btn.disabled = false;
  if (faceBtn) faceBtn.disabled = false;
  if (registerLink) {
    registerLink.style.display = role === "faculty" ? "block" : "none";
  }

  btn.textContent =
    "Sign In as " + (role === "student" ? "Student" : "Faculty");
}

async function doLogin() {
  if (!selectedRole) return;

  const email = document.querySelector(
    'input[placeholder="your@campus.edu"]',
  ).value;
  const password = document.querySelector('input[type="password"]').value;

  try {
    const res = await fetch("http://localhost:5000/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        password: password,
      }),
    });

    const data = await res.json();

    if (data.user) {
      
      if (data.user.role !== selectedRole) {
        showErrorScreen("Access Denied: You cannot login as " + selectedRole);
        return;
      }

      currentUser = data.user;
      localStorage.setItem("campusUser", JSON.stringify(data.user));

      showSuccessScreen("Welcome! You are now signed in.", () => {
        if (selectedRole === "student") {
          showPage("student");
        }
        if (selectedRole === "faculty") {
          showPage("faculty");
        }
      });
    } else {
      showErrorScreen("Invalid email or password");
    }
  } catch (error) {
    console.log("Login error:", error);
  }
}

function doLogout() {
  currentUser = null;
  selectedRole = null;

  localStorage.removeItem("campusUser");

  document.getElementById("loginBtn").disabled = true;
  document.getElementById("loginBtn").textContent = "Sign In as ...";

  document.getElementById("roleStudent").classList.remove("selected");
  document.getElementById("roleFaculty").classList.remove("selected");

  showPage("landing");
}

function openMobileMenu(ctx) {
  document.getElementById(ctx + "MobileOverlay").classList.add("open");
}
function closeMobileMenu(ctx) {
  document.getElementById(ctx + "MobileOverlay").classList.remove("open");
}
function closeModal(id) {
  document.getElementById(id).classList.remove("open");
}

function buildSidebar(containerId, links, activePage) {
  const nav = document.getElementById(containerId);
  if (!nav) return;
  nav.innerHTML = links
    .map(
      (l) =>
        `<button class="sidebar-link${l.page === activePage ? " active" : ""}" onclick="showPage('${l.page}');closeMobileMenu('${activePage}')"><i class="fa-solid ${l.icon}"></i> ${l.label}</button>`,
    )
    .join("");
}
function buildFullSidebar(sidebarId, mobileId, links, activePage) {
  const sb = document.getElementById(sidebarId);
  if (sb) {
    sb.innerHTML = `<div class="sidebar-logo"><i class="fa-solid fa-bolt color-primary"></i> CampusPulse</div><nav class="sidebar-nav">${links.map((l) => `<button class="sidebar-link${l.page === activePage ? " active" : ""}" onclick="showPage('${l.page}')"><i class="fa-solid ${l.icon}"></i> ${l.label}</button>`).join("")}</nav><div class="sidebar-user"><div class="flex items-center gap-3 mb-3"><div class="sidebar-avatar">${
      currentUser
        ? currentUser.name
            .split(" ")
            .map((n) => n[0])
            .join("")
        : ""
    }</div><div class="flex-1 min-w-0"><p class="text-sm font-medium truncate">${currentUser ? currentUser.name : ""}</p><p class="text-xs color-muted capitalize">${currentUser ? currentUser.role : ""}</p></div></div><button class="btn btn-ghost w-full" style="justify-content:flex-start;" onclick="doLogout()"><i class="fa-solid fa-right-from-bracket mr-2"></i> Sign Out</button></div>`;
  }
  const ms = document.getElementById(mobileId);
  if (ms) {
    ms.innerHTML = `<div class="sidebar-logo" style="justify-content:space-between;"><div class="flex items-center gap-2"><i class="fa-solid fa-bolt color-primary"></i> CampusPulse</div><button class="color-muted" onclick="closeMobileMenu('${activePage}')"><i class="fa-solid fa-xmark"></i></button></div><nav class="sidebar-nav">${links.map((l) => `<button class="sidebar-link${l.page === activePage ? " active" : ""}" onclick="showPage('${l.page}');closeMobileMenu('${activePage}')"><i class="fa-solid ${l.icon}"></i> ${l.label}</button>`).join("")}</nav>`;
  }
}

const studentLinks = [
  { label: "Dashboard", page: "student", icon: "fa-gauge-high" },
  { label: "Analytics", page: "analytics", icon: "fa-chart-bar" },
  { label: "Leaderboard", page: "leaderboard", icon: "fa-trophy" },
  { label: "Certificates", page: "certificates", icon: "fa-award" },
];
const facultyLinks = [
  { label: "Dashboard", page: "faculty", icon: "fa-gauge-high" },
  { label: "Analytics", page: "analytics", icon: "fa-chart-bar" },
  { label: "Leaderboard", page: "leaderboard", icon: "fa-trophy" },
];

function animateCounter(el, target, duration) {
  duration = duration || 2000;
  let start = null;
  function step(ts) {
    if (!start) start = ts;
    const p = Math.min((ts - start) / duration, 1);
    el.textContent = Math.floor(
      (1 - Math.pow(1 - p, 3)) * target,
    ).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function destroyChart(id) {
  if (chartInstances[id]) {
    chartInstances[id].destroy();
    delete chartInstances[id];
  }
}

async function renderLanding() {
  const glowClasses = ["glow-cyan", "glow-purple", "glow-blue", "glow-purple"];
  document.getElementById("featuresGrid").innerHTML = featuresList
    .map(
      (f, i) =>
        `<div class="glass-card feature-card ${glowClasses[i % glowClasses.length]}"><div class="feature-icon gradient-bg-subtle"><i class="fa-solid ${f.icon}"></i></div><h3>${f.title}</h3><p>${f.desc}</p></div>`,
    )
    .join("");

  try {
    const res = await fetch("http://localhost:5000/dashboard-stats");
    const stats = await res.json();

    const liveStats = [
      { label: "Total Events", value: stats.totalEvents },
      { label: "Students Participated", value: stats.totalRegistrations },
    ];

    document.getElementById("statsGrid").innerHTML = liveStats
      .map(
        (s) =>
          `<div><div class="stat-counter gradient-text" data-target="${s.value}">0</div><p class="color-muted text-sm mt-2">${s.label}</p></div>`,
      )
      .join("");
  } catch (error) {
    console.log("Error loading landing stats:", error);
    
    document.getElementById("statsGrid").innerHTML = landingStats
      .map(
        (s) =>
          `<div><div class="stat-counter gradient-text" data-target="${s.value}">0</div><p class="color-muted text-sm mt-2">${s.label}</p></div>`,
      )
      .join("");
  }

  const obs = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          animateCounter(e.target, parseInt(e.target.dataset.target));
          obs.unobserve(e.target);
        }
      });
    },
    { threshold: 0.3 },
  );
  document
    .querySelectorAll(".stat-counter")
    .forEach((el) => obs.observe(el));
}

async function renderStudentDashboard() {
  const student = currentUser;
  const res = await fetch(
    `http://localhost:5000/registrations/${currentUser._id}`,
  );
  const myRegs = await res.json();

  studentRegIds = myRegs.map(r => r.eventId);

  const certsEarned = myRegs.filter((r) => r.certificateGenerated).length;
  const attendedCount = myRegs.filter((r) => r.attended).length;

  let rank = 0, top5 = [], ranked = [];
  if (typeof students !== 'undefined') {
    ranked = [...students].sort((a, b) => b.engagementScore - a.engagementScore);
    top5 = ranked.slice(0, 5);
    rank = ranked.findIndex((s) => s.id === "s1") + 1; 
  }

  const myEvents = myRegs
    .map((r) => ({
      ...r,
      event: events.find((e) => e._id === r.eventId),
    }))
    .filter((r) => r.event);

  const upcoming = events.filter(
    (e) => e.status === "upcoming" && !studentRegIds.includes(e._id),
  );

  buildSidebar("studentNav", studentLinks, "student");
  buildSidebar("studentNavMobile", studentLinks, "student");

  document.getElementById("studentAvatar").textContent = student.name
    .split(" ")
    .map((n) => n[0])
    .join("");

  document.getElementById("studentNameSidebar").textContent = student.name;

  const c = document.getElementById("studentContent");
  c.innerHTML = `
    <div class="space-y-8" style="animation:fadeIn .4s ease">
      <div class="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 style="font-size:28px;" class="font-bold">Welcome back, ${student.name.split(" ")[0]} 👋</h1>
          <p class="color-muted mt-1">Here's your campus activity overview</p>
        </div>
      </div>

      <!-- Top Summary Cards -->
      <div class="dashboard-summary">
        <div class="stat-card-modern">
          <div class="icon"><i class="fa-solid fa-calendar-check"></i></div>
          <div class="val stat-value" data-target="${myEvents.length}">0</div>
          <div class="label">Events Registered</div>
        </div>
        <div class="stat-card-modern">
          <div class="icon"><i class="fa-solid fa-circle-check"></i></div>
          <div class="val stat-value" data-target="${attendedCount}">0</div>
          <div class="label">Events Attended</div>
        </div>
        <div class="stat-card-modern">
          <div class="icon"><i class="fa-solid fa-award"></i></div>
          <div class="val stat-value" data-target="${certsEarned}">0</div>
          <div class="label">Certificates Earned</div>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:2.2fr 1fr;gap:24px;" class="chart-row">
        <div class="space-y-6">
          <!-- My Events Section -->
          <div class="glass-card no-hover">
            <h3 class="section-label-modern" style="margin-top:0"><i class="fa-solid fa-bookmark"></i> My Events</h3>
            ${myEvents.length === 0 ? `
              <div class="text-center py-10">
                <i class="fa-solid fa-calendar-plus color-muted mb-4" style="font-size:32px;"></i>
                <p class="color-muted">You haven't registered for any events yet.</p>
              </div>
            ` : `
              <div class="grid grid-2 gap-4">
                ${myEvents.map(ev => {
                  const isCompleted = ev.event.status === 'completed';
                  return `
                    <div class="event-card-modern">
                      <div class="header">
                        <span class="badge ${isCompleted ? 'badge-success' : 'badge-gradient'}">${ev.event.status}</span>
                        ${ev.attended ? '<span class="attended-tag"><i class="fa-solid fa-circle-check"></i> Attended</span>' : ''}
                      </div>
                      <h4 class="title">${ev.event.title}</h4>
                      <div class="meta">
                        <div class="meta-item"><i class="fa-regular fa-calendar"></i> ${ev.event.date}</div>
                        <div class="meta-item"><i class="fa-solid fa-location-dot"></i> ${ev.event.venue}</div>
                      </div>
                      <div class="footer">
                        <button class="btn btn-outline btn-sm flex-1" onclick="showStudentQR('${ev._id}')">
                          <i class="fa-solid fa-qrcode mr-2"></i> QR Code
                        </button>
                        ${ev.certificateGenerated ? `
                          <button class="btn btn-primary btn-sm flex-1" onclick="downloadCertificate('${ev._id}')">
                            <i class="fa-solid fa-download"></i>
                          </button>
                        ` : ''}
                      </div>
                    </div>
                  `;
                }).join('')}
              </div>
            `}
          </div>

          <!-- Engagement Chart -->
          <div class="glass-card no-hover">
            <h3 class="section-label-modern" style="margin-top:0"><i class="fa-solid fa-chart-line"></i> Engagement Trend</h3>
            <div class="chart-container">
              <canvas id="engagementChart"></canvas>
            </div>
          </div>
        </div>

        <div class="space-y-6">
          <!-- Leaderboard Preview -->
          <div class="glass-card no-hover">
            <h3 class="section-label-modern" style="margin-top:0"><i class="fa-solid fa-trophy color-warning"></i> Leaderboard</h3>
            ${top5.length > 0 ? `
              <div class="space-y-3">
                ${top5.map((s, i) => `
                  <div class="flex items-center gap-3 p-2 rounded-xl ${s.id === 's1' ? 'background:hsla(245,58%,58%,.1);border:1px solid hsla(245,58%,58%,.2);' : ''}">
                    <span class="rank-circle ${i < 3 ? 'gradient-bg' : ''}" style="${i >= 3 ? 'background:var(--secondary);color:var(--muted-fg);' : 'color:#fff;'}">${i + 1}</span>
                    <div class="flex-1 min-w-0">
                      <p class="text-sm font-semibold truncate">${s.name}</p>
                      <p class="text-xs color-muted">${s.department}</p>
                    </div>
                    <span class="text-sm font-bold color-primary">${s.engagementScore}</span>
                  </div>
                `).join('')}
              </div>
            ` : '<p class="color-muted text-center py-4">Ranking data unavailable</p>'}
          </div>

          <!-- Your Stats Info -->
          <div class="glass-card no-hover gradient-bg-subtle" style="border-color:hsla(245,58%,58%,.2)">
            <h4 class="text-sm font-bold mb-3 uppercase tracking-wide">My Performance</h4>
            <div class="space-y-4">
              <div class="flex justify-between items-center">
                <span class="text-xs color-muted">Global Rank</span>
                <span class="font-bold">#${rank || '—'}</span>
              </div>
              <div class="flex justify-between items-center">
                <span class="text-xs color-muted">Total Points</span>
                <span class="font-bold color-primary">${student.engagementScore || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Upcoming Events -->
      <div>
        <h3 class="section-label-modern"><i class="fa-solid fa-bolt color-warning"></i> Explore Upcoming Events</h3>
        <div class="event-grid-modern">
          ${upcoming.map(ev => {
            const isFull = ev.registered >= ev.capacity;
            return `
              <div class="event-card-modern">
                <div class="header">
                  <span class="badge badge-outline">${ev.category}</span>
                </div>
                <h4 class="title">${ev.title}</h4>
                <p class="event-desc-modern">${ev.description}</p>
                
                <div class="meta">
                  <div class="meta-item"><i class="fa-regular fa-clock"></i> ${ev.date} at ${ev.time || '10:00 AM'}</div>
                  <div class="meta-item"><i class="fa-solid fa-location-dot"></i> ${ev.venue}</div>
                </div>

                <div class="mt-auto">
                  <div class="capacity-info">
                    <span>${ev.registered}/${ev.capacity} registered</span>
                    <span class="${isFull ? 'color-destructive' : 'color-success'}">${isFull ? 'Full' : 'Available'}</span>
                  </div>
                  <div class="capacity-bar">
                    <div class="capacity-fill" style="width:${(ev.registered / ev.capacity) * 100}%"></div>
                  </div>
                  <button 
                    class="btn ${isFull ? 'btn-outline' : 'btn-primary'} btn-sm w-full mt-4" 
                    onclick="${isFull ? '' : `registerForEvent('${ev._id}')`}"
                    ${isFull ? 'disabled' : ''}
                  >
                    ${isFull ? 'Event Full' : 'Register Now'}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;

  c.querySelectorAll(".stat-value").forEach((el) =>
    animateCounter(el, parseInt(el.dataset.target), 1500),
  );

  destroyChart("engagementChart");
  const chartEl = document.getElementById("engagementChart");
  if (chartEl) {
    const ctx = chartEl.getContext("2d");
    chartInstances["engagementChart"] = new Chart(ctx, {
      type: "line",
      data: {
        labels: engagementTrend.map((d) => d.month),
        datasets: [
          {
            label: "Participation Score",
            data: engagementTrend.map((d) => d.score),
            borderColor: "#6c5ce7",
            backgroundColor: "rgba(108,92,231,0.1)",
            fill: true,
            tension: 0.4,
            pointRadius: 4,
            pointHoverRadius: 6,
            pointBackgroundColor: "#6c5ce7",
            borderWidth: 2,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: {
            ticks: { color: "hsl(220,15%,55%)", font: { family: 'Space Grotesk' } },
            grid: { color: "hsla(230,20%,18%,0.5)" },
          },
          y: {
            beginAtZero: true,
            ticks: { color: "hsl(220,15%,55%)", font: { family: 'Space Grotesk' } },
            grid: { color: "hsla(230,20%,18%,0.5)" },
          },
        },
      },
    });
  }
}

async function registerForEvent(eventId) {
  if (!currentUser) {
    showToast("Please login first", "error");
    return;
  }

  try {
    const response = await fetch("http://localhost:5000/register-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        studentId: currentUser._id,
        eventId: eventId,
      }),
    });

    let data;

    try {
      data = await response.json();
    } catch {
      data = { message: "Registration failed" };
    }

    if (response.ok) {
      showToast(data.message || "Successfully registered for event!", "success", () => {
        
        confetti({
          particleCount: 150,
          spread: 70,
          origin: { y: 0.6 },
          colors: ["#6c5ce7", "#a855f7", "#4a6cf7"],
        });

        document.getElementById("studentQRImage").src = data.qrCode;
        document.getElementById("qrDisplayModal").classList.add("open");
      });
    } else {
      showToast(data.message || "Registration failed", "error");
    }
  } catch (error) {
    console.log("Registration error:", error);
    showToast("Server error during registration", "error");
  }
  await loadEvents();
  renderStudentDashboard();
}

function renderFacultyDashboard() {
  const faculty = currentUser;

  document.getElementById("facultyNameSidebar").textContent =
    faculty.name;

  document.getElementById("facultyAvatar").textContent = faculty.name
    .split(" ")
    .map((n) => n[0])
    .join("");
  loadDashboardStats();
  buildSidebar("facultyNav", facultyLinks, "faculty");
  buildSidebar("facultyNavMobile", facultyLinks, "faculty");
  const completed = events.filter((e) => e.status === "completed").length,
    totalReg = events.reduce((s, e) => s + e.registered, 0),
    avg = Math.round(totalReg / events.length);
  const c = document.getElementById("facultyContent");
  c.innerHTML = `<div class="space-y-8" style="animation:fadeIn .4s ease">
<div class="flex items-center justify-between flex-wrap gap-4"><div><h1 style="font-size:24px;" class="font-bold">Faculty Dashboard</h1><p class="color-muted mt-1">Manage events and track engagement</p></div><button class="btn btn-primary" onclick="document.getElementById('createEventModal').classList.add('open')"><i class="fa-solid fa-plus mr-2"></i> Create Event</button></div>
<div class="grid grid-4">
<div class="glass-card stat-card"><div class="flex items-center justify-between mb-3"><span class="text-sm font-medium color-muted">Total Events</span><div class="stat-icon gradient-bg-subtle"><i class="fa-solid fa-calendar"></i></div></div><div class="stat-value" data-target="${events.length}">0</div></div>
<div class="glass-card stat-card"><div class="flex items-center justify-between mb-3"><span class="text-sm font-medium color-muted">Total Registrations</span><div class="stat-icon gradient-bg-subtle"><i class="fa-solid fa-users"></i></div></div><div class="stat-value" data-target="${totalReg}">0</div></div>
<div class="glass-card stat-card"><div class="flex items-center justify-between mb-3"><span class="text-sm font-medium color-muted">Completed Events</span><div class="stat-icon gradient-bg-subtle"><i class="fa-solid fa-award"></i></div></div><div class="stat-value" data-target="${completed}">0</div></div>
<div class="glass-card stat-card"><div class="flex items-center justify-between mb-3"><span class="text-sm font-medium color-muted">Avg Attendance</span><div class="stat-icon gradient-bg-subtle"><i class="fa-solid fa-arrow-trend-up"></i></div></div><div class="stat-value" data-target="${avg}">0</div></div>
</div>
<div class="glass-card no-hover"><h3 class="font-semibold text-lg mb-4">Event Management</h3><div class="overflow-auto"><table><thead><tr><th>Event</th><th class="hide-mobile">Date</th><th class="hide-mobile">Department</th><th>Status</th><th>Regs</th><th style="text-align:right;">Actions</th></tr></thead><tbody>${events
    .map((ev) => {
      const bc =
        ev.status === "completed"
          ? "badge-success"
          : ev.status === "ongoing"
            ? "badge-warning"
            : "badge-primary";
      return `<tr><td class="font-medium">${ev.title}</td><td class="hide-mobile color-muted">${ev.date}</td><td class="hide-mobile color-muted">${ev.department}</td><td><span class="badge ${bc}">${ev.status}</span></td><td>${ev.registered}/${ev.capacity}</td>
      <td style="text-align:right;">

      <button class="btn btn-ghost btn-sm" onclick="copyEventLink('${ev._id}')">
        <i class="fa-solid fa-link"></i>
      </button>

      <button class="btn btn-ghost btn-sm" onclick="showRegistrations('${ev._id}')">
        <i class="fa-solid fa-users"></i>
      </button>

      <button class="btn btn-ghost btn-sm" onclick="openQRScanner('${ev._id}')">
      <i class="fa-solid fa-qrcode"></i>
      </button>
  
      <button class="btn btn-ghost btn-sm" onclick="editEvent('${ev._id}')">
      <i class="fa-solid fa-pen-to-square"></i>
      </button>
  
  <button class="btn btn-ghost btn-sm" onclick="deleteEvent('${ev._id}')" style="color:var(--destructive);"><i class="fa-solid fa-trash"></i></button></td></tr>`;
    })
    .join("")}</tbody></table></div></div>
</div>`;
  c.querySelectorAll(".stat-value").forEach((el) =>
    animateCounter(el, parseInt(el.dataset.target), 1500),
  );
  document.getElementById("newDept").innerHTML = departments
    .map((d) => `<option value="${d}">${d}</option>`)
    .join("");
  document.getElementById("newCat").innerHTML = categories
    .map((cc) => `<option value="${cc}">${cc}</option>`)
    .join("");
}

async function createNewEvent() {
  const title = document.getElementById("newTitle").value;
  const description = document.getElementById("newDesc").value;
  const date = document.getElementById("newDate").value;
  const time = document.getElementById("newTime").value;
  const venue = document.getElementById("newVenue").value;
  const department = document.getElementById("newDept").value;
  const category = document.getElementById("newCat").value;
  const capacity = document.getElementById("newCapacity").value;

  try {
    let url = "http://localhost:5000/create-event";
    let method = "POST";

    if (editingEventId) {
      url = `http://localhost:5000/update-event/${editingEventId}`;
      method = "PUT";
    }

    const response = await fetch(url, {
      method: method,
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
        description,
        date,
        time,
        venue,
        department,
        category,
        capacity,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      showToast("Event creation failed", "error");
      return;
    }

    showToast("Event created successfully");

    closeModal("createEventModal");
    editingEventId = null;

    loadEvents();
  } catch (error) {
    console.log(error);
    showToast("Server error creating event", "error");
  }
  await loadEvents();
  renderFacultyDashboard();
}
async function deleteEvent(id) {
  try {
    const response = await fetch(
      `http://localhost:5000/delete-event/${id}`,
      {
        method: "DELETE",
      },
    );

    const data = await response.text();

    if (!response.ok) {
      showToast(data || "Delete failed", "error");
      return;
    }

    showToast("Event deleted successfully");

    await loadEvents(); 
    renderFacultyDashboard();
  } catch (error) {
    console.log("Delete error:", error);
    showToast("Server error deleting event", "error");
  }
}

async function showRegistrations(eventId) {
  try {
    const res = await fetch(
      `http://localhost:5000/event-registrations/${eventId}`,
    );
    const regs = await res.json();

    const ev = events.find((e) => e._id === eventId);

    document.getElementById("regsModalTitle").textContent =
      "Registrations — " + ev.title;

    const mc = document.getElementById("regsModalContent");

    mc.innerHTML = regs
      .map(
        (r) => `
<div class="faculty-reg-row">

<div>
<p class="font-medium text-sm">${r.studentId.name}</p>
<p class="text-xs color-muted">${r.studentId.email}</p>
</div>

<div class="flex gap-2">

<button class="btn btn-outline-primary btn-sm"
onclick="generateCertificate('${r._id}')">
Certificate
</button>

<button class="btn btn-outline btn-sm"
onclick="deleteStudentRegistration('${r._id}')">
Remove
</button>

</div>

</div>
`,
      )
      .join("");

    document.getElementById("regsModal").classList.add("open");
  } catch (error) {
    console.log("Registration fetch error:", error);
  }
}

function renderAnalytics() {
  const links =
    currentUser && currentUser.role === "faculty"
      ? facultyLinks
      : studentLinks;
  buildFullSidebar(
    "analyticsSidebar",
    "analyticsMobileSidebar",
    links,
    "analytics",
  );
  const eventPop = [...events]
    .sort((a, b) => b.registered - a.registered)
    .slice(0, 5);
  const c = document.getElementById("analyticsContent");
  c.innerHTML = `<div class="space-y-8" style="animation:fadeIn .4s ease"><div><h1 style="font-size:24px;" class="font-bold">Analytics</h1><p class="color-muted mt-1">Deep insights into campus engagement</p></div>
  <div class="grid grid-2">

    <div class="glass-card no-hover">
      <h3 class="font-semibold mb-4">Attendance Rate</h3>
      <div class="chart-container">
        <canvas id="attendanceChart"></canvas>
      </div>
    </div>

  <div class="glass-card no-hover">
    <h3 class="font-semibold mb-4">Event Registrations Overview</h3>
    <div class="chart-container">
      <canvas id="eventRegChart"></canvas>
  </div>
</div>

    <div class="glass-card no-hover"><h3 class="font-semibold mb-4">Event Popularity</h3><div class="chart-container"><canvas id="popChart"></canvas></div><div class="flex flex-wrap gap-2 mt-4">${eventPop.map((ep, i) => `<span class="text-xs color-muted flex items-center gap-2"><span style="width:8px;height:8px;border-radius:50%;background:${COLORS[i]};display:inline-block;"></span>${ep.title.length > 20 ? ep.title.slice(0, 20) + "…" : ep.title}</span>`).join("")}</div></div>
</div></div>`;
  
  destroyChart("popChart");
  const gc = "hsl(230,20%,18%)",
    tc = "hsl(220,15%,55%)";

  destroyChart("attendanceChart");
  destroyChart("eventRegChart");

  const eventRegLabels = events.map((e) => e.title);
  const eventRegValues = events.map((e) => e.registered);

  chartInstances["eventRegChart"] = new Chart(
    document.getElementById("eventRegChart"),
    {
      type: "bar",
      data: {
        labels: eventRegLabels,
        datasets: [
          {
            label: "Registrations",
            data: eventRegValues,
            backgroundColor: "#8b5cf6",
            borderRadius: 6,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
        },
      },
    },
  );

  chartInstances["popChart"] = new Chart(
    document.getElementById("popChart"),
    {
      type: "doughnut",
      data: {
        labels: eventPop.map((e) =>
          e.title.length > 20 ? e.title.slice(0, 20) + "…" : e.title,
        ),
        datasets: [
          {
            data: eventPop.map((e) => e.registered),
            backgroundColor: COLORS,
            borderWidth: 0,
            spacing: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "60%",
        plugins: { legend: { display: false } },
      },
    },
  );
  
  fetch("http://localhost:5000/attendance-analytics")
    .then((res) => res.json())
    .then((data) => {
      const labels = data.map((e) => e.eventTitle);
      const registered = data.map((e) => e.registered);
      const attended = data.map((e) => e.attended);

      chartInstances["attendanceChart"] = new Chart(
        document.getElementById("attendanceChart"),
        {
          type: "bar",
          data: {
            labels: labels,
            datasets: [
              {
                label: "Registered",
                data: registered,
                backgroundColor: "#8b5cf6",
              },
              {
                label: "Attended",
                data: attended,
                backgroundColor: "#22c55e",
              },
            ],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
          },
        },
      );
    })
    .catch((err) => console.log("Attendance analytics error:", err));
}

function renderLeaderboard() {
  const links =
    currentUser && currentUser.role === "faculty"
      ? facultyLinks
      : studentLinks;
  buildFullSidebar(
    "leaderboardSidebar",
    "leaderboardMobileSidebar",
    links,
    "leaderboard",
  );
  const ranked = [...students].sort(
      (a, b) => b.engagementScore - a.engagementScore,
    ),
    podium = [ranked[1], ranked[0], ranked[2]];
  const icons = ["fa-medal", "fa-trophy", "fa-award"],
    iconColors = ["var(--muted-fg)", "var(--warning)", "var(--primary)"];
  const c = document.getElementById("leaderboardContent");
  c.innerHTML = `<div class="space-y-8" style="animation:fadeIn .4s ease"><div><h1 style="font-size:24px;" class="font-bold">Leaderboard</h1><p class="color-muted mt-1">Top students by participation & engagement</p></div>
<div class="grid grid-3" style="max-width:640px;margin:0 auto;">${podium
.map((s, i) => {
  const order = [2, 1, 3][i],
    isFirst = order === 1;
  return `<div class="glass-card podium-card${isFirst ? " podium-first glow" : ""}"><div class="podium-avatar${isFirst ? " gradient-bg" : ""}" style="${!isFirst ? "background:var(--secondary);" : ""}color:${isFirst ? "#fff" : "var(--fg)"};">${s.name
    .split(" ")
    .map((n) => n[0])
    .join(
      "",
    )}</div><i class="fa-solid ${icons[order - 1]}" style="color:${iconColors[order - 1]};font-size:18px;"></i><p class="font-semibold text-sm mt-1">${s.name}</p><p class="text-xs color-muted mb-2">${s.department}</p><span style="font-size:24px;" class="font-bold gradient-text">${s.engagementScore}</span><p class="text-xs color-muted">points</p></div>`;
})
.join("")}</div>
<div class="glass-card no-hover overflow-auto"><table><thead><tr><th>Rank</th><th>Student</th><th class="hide-mobile">Department</th><th style="text-align:center;">Events</th><th style="text-align:center;">Score</th></tr></thead><tbody>${ranked.map((s, i) => `<tr><td><span class="rank-circle${i < 3 ? " gradient-bg" : ""}" style="${i >= 3 ? "background:var(--secondary);color:var(--muted-fg);" : "color:#fff;"}">${i + 1}</span></td><td class="font-medium">${s.name}</td><td class="hide-mobile color-muted">${s.department}</td><td style="text-align:center;">${s.eventsAttended}</td><td style="text-align:center;"><span class="font-semibold color-primary">${s.engagementScore}</span></td></tr>`).join("")}</tbody></table></div></div>`;
}

async function renderCertificates() {
  buildFullSidebar(
    "certificatesSidebar",
    "certificatesMobileSidebar",
    studentLinks,
    "certificates",
  );

  try {
    const studentId = currentUser._id;

    const res = await fetch(
      `http://localhost:5000/registrations/${studentId}`,
    );

    const registrations = await res.json();

    const myCerts = registrations.filter((r) => r.certificateGenerated);

    const c = document.getElementById("certificatesContent");

    if (!myCerts.length) {
      c.innerHTML = `
<div class="space-y-8">
  <h1 style="font-size:24px;" class="font-bold">Certificates</h1>
  <p class="color-muted">No certificates yet. Attend events to earn them!</p>
</div>`;
      return;
    }

    c.innerHTML = myCerts
      .map(
        (cert) => `
<div class="glass-card">
  <h3>Certificate Available</h3>
  <button class="btn btn-primary" onclick="downloadCertificate('${cert._id}')">
    Download Certificate
  </button>
</div>
`,
      )
      .join("");
  } catch (error) {
    console.log("Certificate load error:", error);
  }
}

async function loadDashboardStats() {
  try {
    const res = await fetch("http://localhost:5000/dashboard-stats");

    const data = await res.json();

    console.log("Dashboard Stats:", data);
  } catch (error) {
    console.log("Error loading stats:", error);
  }
}
async function generateCertificate(registrationId) {
  try {
    const response = await fetch(
      `http://localhost:5000/generate-certificate/${registrationId}`,
    );

    if (response.ok) {
      showToast("Certificate Generated Successfully");
    } else {
      showToast("Certificate Generation Failed");
    }
  } catch (error) {
    console.log("Certificate error:", error);
  }
}
function downloadCertificate(registrationId) {
  const url = `http://localhost:5000/generate-certificate/${registrationId}`;

  window.open(url, "_blank");
}
function downloadStudentQR() {
  const img = document.getElementById("studentQRImage");

  const link = document.createElement("a");
  link.href = img.src;
  link.download = "event-qr.png";

  link.click();
}

async function showStudentQR(registrationId) {
  try {
    const res = await fetch(
      `http://localhost:5000/registrations/${currentUser._id}`,
    );
    const regs = await res.json();

    const reg = regs.find((r) => r._id === registrationId);
    if (!reg || !reg.qrCode) {
      showToast("QR not available", "error");
      return;
    }

    document.getElementById("studentQRImage").src = reg.qrCode;
    document.getElementById("qrDisplayModal").classList.add("open");
  } catch (error) {
    console.log("QR load error:", error);
    showToast("Unable to load QR", "error");
  }
}

let qrScanner;

function openQRScanner(eventId) {
  window.currentScanEvent = eventId;
  document.getElementById("qrScannerModal").classList.add("open");

  qrScanner = new Html5Qrcode("qr-reader");

  let scanningLocked = false;

  qrScanner.start(
    { facingMode: "environment" },
    { fps: 10, qrbox: 250 },

    async (decodedText) => {
      if (scanningLocked) return;

      scanningLocked = true;

      const success = await markAttendance(decodedText);

      if (success) {
        
        closeQRScanner();
      } else {
        
        setTimeout(() => {
          scanningLocked = false;
        }, 2000);
      }
    },
  );
}

function closeQRScanner() {
  if (qrScanner) {
    qrScanner.stop();
  }

  document.getElementById("qrScannerModal").classList.remove("open");
}

async function markAttendance(registrationId) {
  try {
    const response = await fetch(
      "http://localhost:5000/mark-attendance",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          registrationId: registrationId,
          eventId: window.currentScanEvent,
        }),
      },
    );

    const data = await response.text();

    if (!response.ok) {
      showToast(data || "Invalid QR Code", "error");
      return false;
    }

    showToast("Attendance marked successfully");
    return true;
  } catch (error) {
    console.log("Attendance error:", error);
    showToast("Server error", "error");
    return false;
  }
}

async function deleteStudentRegistration(regId) {
  if (!confirm("Remove this student from event?")) return;

  try {
    const res = await fetch(
      `http://localhost:5000/delete-registration/${regId}`,
      { method: "DELETE" },
    );

    if (res.ok) {
      showToast("Student removed from event");
      location.reload();
    }
  } catch (error) {
    console.log(error);
  }
}

async function registerStudentFromLink() {
  const name = document.getElementById("regName").value;
  const email = document.getElementById("regEmail").value;
  const department = document.getElementById("regDept").value;

  if (!name || !email) {
    showToast("Please enter name and email", "error");
    return;
  }

  try {
    
    const userRes = await fetch("http://localhost:5000/create-user", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: name,
        email: email,
        role: "student",
        department: department,
        year: 1,
      }),
    });

    const createdUser = await userRes.json();

    const loginRes = await fetch("http://localhost:5000/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: email,
        password: createdUser.password,
      }),
    });

    const userData = await loginRes.json();
    currentUser = userData.user;
    localStorage.setItem("campusUser", JSON.stringify(userData.user));

    const response = await fetch("http://localhost:5000/register-event", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        studentId: userData.user._id,
        eventId: window.eventRegistrationId,
      }),
    });
    const data = await response.json();

    if (response.ok) {
      showToast("Registration successful! Welcome to CampusPulse.", "success", () => {
        showPage("student");
      });
    } else {
      showToast(data.message || "Registration failed", "error");
    }
  } catch (error) {
    console.log(error);
    showToast("Server error", "error");
  }
}

async function initApp() {
  await loadEvents(); 

  document.querySelectorAll(".search-input").forEach((input) => {
    input.addEventListener("input", (e) => {
      const term = e.target.value.toLowerCase();
      const targets = document.querySelectorAll(
        ".event-card, .reg-event-row, .faculty-reg-row, tbody tr",
      );

      targets.forEach((el) => {
        const text = el.innerText.toLowerCase();
        el.style.display = text.includes(term) ? "" : "none";
      });
    });
  });

  const lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 1,
    smoothTouch: false,
    touchMultiplier: 2,
    infinite: false,
  });

  function raf(time) {
    lenis.raf(time);
    requestAnimationFrame(raf);
  }
  requestAnimationFrame(raf);

  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((time) => {
    lenis.raf(time * 1000);
  });
  gsap.ticker.lagSmoothing(0);

  gsap.registerPlugin(ScrollTrigger);

  gsap.to(".hero-glow1", {
    y: 300,
    scale: 1.2,
    opacity: 0.5,
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom top",
      scrub: true
    }
  });

  gsap.to(".hero-glow2", {
    y: -200,
    scale: 0.8,
    opacity: 0.3,
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom top",
      scrub: true
    }
  });

  const heroTl = gsap.timeline({
    scrollTrigger: {
      trigger: ".hero",
      start: "top top",
      end: "bottom top",
      scrub: true,
      pin: false
    }
  });

  heroTl.to(".hero-content", {
    z: -200,
    y: 100,
    rotateX: 5,
    opacity: 0,
    ease: "none"
  });

  const revealElements = document.querySelectorAll(".reveal-up");
  revealElements.forEach((el) => {
    gsap.to(el, {
      opacity: 1,
      y: 0,
      duration: 1,
      ease: "expo.out",
      scrollTrigger: {
        trigger: el,
        start: "top 85%",
        toggleActions: "play none none reverse"
      }
    });
  });

  gsap.from(".feature-card", {
    opacity: 0,
    y: 50,
    z: -50,
    rotateX: 10,
    stagger: 0.1,
    duration: 0.8,
    ease: "back.out(1.7)",
    scrollTrigger: {
      trigger: ".features-grid",
      start: "top 80%"
    }
  });

  ScrollTrigger.create({
    trigger: ".stats-section",
    start: "top 75%",
    onEnter: () => {
      document.querySelectorAll(".stat-counter").forEach(el => {
        const target = parseInt(el.dataset.target);
        animateCounter(el, target, 2000);
      });
    }
  });

  gsap.to(".landing-nav .font-bold", {
    y: -2,
    repeat: -1,
    yoyo: true,
    duration: 2,
    ease: "sine.inOut"
  });

  const params = new URLSearchParams(window.location.search);
  const eventFromLink = params.get("event");

  if (eventFromLink) {
    console.log("Student opened event link:", eventFromLink);

    window.eventRegistrationId = eventFromLink; 

    localStorage.removeItem("campusUser");

    showPage("event-register");

    setTimeout(() => {
      document.getElementById("eventRegistrationBox").style.display =
        "block";
    }, 200);

    showToast("Register for this event to continue");
    return;
  }

  const savedUser = localStorage.getItem("campusUser");

  if (savedUser) {
    currentUser = JSON.parse(savedUser);

    if (currentUser.role === "student") {
      showPage("student");
    } else {
      showPage("faculty");
    }
  } else {
    showPage("landing");
  }

  initMagneticButtons();
  initTiltEffect();

  const regDeptSelect = document.getElementById("regFullDept");
  if (regDeptSelect) {
    regDeptSelect.innerHTML = '<option value="">Select department</option>' + 
      departments.map((d) => `<option value="${d}">${d}</option>`).join("");
  }

  loadFaceModels();
}

function copyEventLink(eventId) {
  const link = window.location.origin + "?event=" + eventId;

  navigator.clipboard.writeText(link);

  showToast("Event registration link copied!");
}
let editingEventId = null;

function editEvent(eventId) {
  const ev = events.find((e) => e._id === eventId);

  if (!ev) return;

  editingEventId = eventId;

  document.getElementById("newTitle").value = ev.title;
  document.getElementById("newDesc").value = ev.description;
  document.getElementById("newDate").value = ev.date;
  document.getElementById("newTime").value = ev.time;
  document.getElementById("newVenue").value = ev.venue;
  document.getElementById("newDept").value = ev.department;
  document.getElementById("newCat").value = ev.category;
  document.getElementById("newCapacity").value = ev.capacity;

  document.getElementById("createEventModal").classList.add("open");
}

initApp();
