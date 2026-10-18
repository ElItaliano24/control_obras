// supabase.js - Configuración y cliente de Supabase
let SUPABASE_URL = localStorage.getItem("tot_supa_url") || "https://tvxngammtltditnnsokn.supabase.co";
let SUPABASE_KEY = localStorage.getItem("tot_supa_key") || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2eG5nYW1tdGx0ZGl0bm5zb2tuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAzMDkyMTEsImV4cCI6MjEwNTg4NTIxMX0.Q9Dav40O7-CAT1IcKVMW2s62QvQfCrR8HauxYNR66Gs";

let supabaseClient = null;

function initSupabase() {
  if (SUPABASE_KEY && SUPABASE_URL) {
    try {
      supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      updateBadgeStatus(true);
    } catch (e) {
      console.error("Error al iniciar Supabase:", e);
      updateBadgeStatus(false);
    }
  } else {
    supabaseClient = null;
    updateBadgeStatus(false);
  }
}

function updateBadgeStatus(connected) {
  const badge = document.getElementById("connectionBadge");
  if (!badge) return;
  if (connected && navigator.onLine) {
    badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-600"></span><span>Conectado</span>`;
  } else {
    badge.className = "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-red-100 text-red-800 border border-red-300";
    badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span><span>Sin Conexión</span>`;
  }
}

let offlineTimeout = null;

// Manejo inteligente de red con margen de tolerancia
window.addEventListener('online', () => {
  clearTimeout(offlineTimeout);
  updateBadgeStatus(true);
});

window.addEventListener('offline', () => {
  clearTimeout(offlineTimeout);
  offlineTimeout = setTimeout(() => {
    updateBadgeStatus(false);
  }, 3500);
});

function openSettingsModal() {
  document.getElementById("cfgUrl").value = SUPABASE_URL;
  document.getElementById("cfgKey").value = SUPABASE_KEY;
  document.getElementById("settingsModal").classList.remove("hidden");
}

function closeSettingsModal() {
  document.getElementById("settingsModal").classList.add("hidden");
}

function saveSettings() {
  SUPABASE_URL = document.getElementById("cfgUrl").value.trim();
  SUPABASE_KEY = document.getElementById("cfgKey").value.trim();

  localStorage.setItem("tot_supa_url", SUPABASE_URL);
  localStorage.setItem("tot_supa_key", SUPABASE_KEY);

  initSupabase();
  closeSettingsModal();
  alert("Configuración actualizada.");
}
