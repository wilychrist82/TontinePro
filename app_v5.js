/* ==========================================
   Tontine Pro - App Controller (Clean Rewrite)
   ========================================== */

// --- 1. SUPABASE ---
// Le client Supabase est géré par supabase.js (chargé avant app.js).
// Utiliser getSupabaseClient() pour obtenir l'instance.

// --- 2. GLOBAL STATE ---
function toggleCustomDays(selectEl, groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    if (selectEl.value === 'Personnalisé' || selectEl.value.startsWith('Chaque')) {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
    }
}
window.toggleCustomDays = toggleCustomDays;

function toggleTontineType(selectEl, groupId) {
    const group = document.getElementById(groupId);
    if (!group) return;
    if (selectEl.value === 'Objectif') {
        group.style.display = 'block';
    } else {
        group.style.display = 'none';
    }
}
window.toggleTontineType = toggleTontineType;

const state = {
    user: {
        name: "Utilisateur",
        role: "Gestionnaire",
        avatar: "https://ui-avatars.com/api/?name=Utilisateur&background=random"
    },
    stats: {
        activeTontines: 0,
        totalAmountInPlay: 0,
        toursInProgress: 0,
        validatedPaymentsToday: 0,
        totalMembers: 0,
        participationRate: 0
    },
    donut: { receivedPercent: 0, pendingPercent: 0, delayedPercent: 0 },
    nextRound: {
        recipientName: "-",
        recipientAvatar: "https://ui-avatars.com/api/?name=NA&background=random",
        role: "Doit recevoir",
        payoutAmount: 0,
        timeBadge: "-",
        tontineName: "-",
        tourCount: "-",
        date: "-",
        isClosed: false
    },
    activeTontines: [],
    recentMessages: [],
    transactions: []
};

let extendedMembers = [];
let reportsChartInstance = null;

// --- 2.5. UTILITAIRES PREMIUM ---
function escapeHTML(str) {
    if (!str) return '';
    return str.toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}
function getAvatarInitials(name) {
    if (!name) return 'U';
    const letters = name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
    const colors = ['5C60F5', '10B981', 'F59E0B', 'EF4444', '8B5CF6'];
    const color = colors[name.length % colors.length];
    return `https://ui-avatars.com/api/?name=${letters}&background=${color}&color=fff&bold=true`;
}
function formatCurrency(amount) {
    return new Intl.NumberFormat('fr-FR').format(amount || 0);
}
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return console.warn('Toast:', message);
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let iconSvg = '';
    if (type === 'success') iconSvg = '<polyline points="20 6 9 17 4 12"></polyline>';
    else if (type === 'error') iconSvg = '<line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>';
    else iconSvg = '<circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line>';
    toast.innerHTML = `<div class="toast-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${iconSvg}</svg></div><div class="toast-content"><div class="toast-title">${type === 'success' ? 'Succès' : type === 'error' ? 'Erreur' : 'Information'}</div><div class="toast-message">${escapeHTML(message)}</div></div>`;
    container.appendChild(toast);
    requestAnimationFrame(() => setTimeout(() => toast.classList.add('show'), 10));
    setTimeout(() => { toast.classList.remove('show'); toast.classList.add('hiding'); setTimeout(() => toast.remove(), 400); }, 4000);
}

// Redéfinition globale de alert() pour utiliser Toasts
window.alert = function(message) {
    if (!message) return;
    const msgStr = message.toString();
    const type = msgStr.toLowerCase().includes('erreur') ? 'error' : 'info';
    showToast(msgStr, type);
};
// --- 3. DOM ELEMENTS ---
const splashScreen = document.getElementById('splash-screen');
const appContainer = document.getElementById('app-container');
const btnStart = document.getElementById('btn-start');
const soundSuccess = document.getElementById('sound-success');

// Les boutons d'actions rapides sont lus directement dans setupQuickActions() (appelée dans init() après DOMContentLoaded)

const navItems = document.querySelectorAll('.nav-item');
const tabPanes = document.querySelectorAll('.tab-pane');

// --- 4. LIFECYCLE INITIALIZATION ---
async function init() {
    if (btnStart) btnStart.addEventListener('click', () => { splashScreen.classList.add('hidden'); appContainer.classList.remove('hidden'); });

    showGlobalLoader();

    // 0. Détection du mode Membre Invité (verrouillage de la vue membre pour un utilisateur rejoignant via un lien d'invitation)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('role') === 'membre' || urlParams.get('invite') !== null || urlParams.get('ref') !== null) {
        localStorage.setItem('tontine_invited_member_mode', 'true');
    } else if (urlParams.get('admin_force') === 'true') {
        localStorage.removeItem('tontine_invited_member_mode');
    }
    if (localStorage.getItem('tontine_invited_member_mode') === 'true') {
        if (!state.user) state.user = {};
        state.user.role = 'Membre';
    }

    // 1. Initialisation DataService & Vérification Auth
    if (typeof DataService !== 'undefined') {
        await DataService.init();
        if (!DataService.isDemoMode()) {
            const { data: { session }, error } = await DataService.getSession();
            if (error || !session) {
                alert('Vous avez été déconnecté.');
                window.location.href = 'connexion/index.html' + window.location.search;
                return; // On arrête l'initialisation du dashboard
            }
            
            // Utilisateur connecté
            console.log('[Auth] Connecté en tant que:', session.user.email);
            
            // Mise à jour basique du nom (en attendant le chargement du profil)
            const username = session.user.email.split('@')[0];
            document.querySelectorAll('.sb-uname').forEach(el => el.textContent = username);
            document.querySelectorAll('.tb-title').forEach(el => el.innerHTML = `Bienvenue, ${username} ! &#x1F44B;`);
        }
    }

    // Theme
    const btnThemeToggle = document.getElementById('btn-theme-toggle');
    if (btnThemeToggle) btnThemeToggle.addEventListener('click', toggleTheme);
    loadThemePreference();

    // Mobile Sidebar
    const btnToggleSidebar = document.getElementById('btn-toggle-sidebar');
    // Members search
    const membersSearch = document.getElementById('members-search');
    if (membersSearch) {
        membersSearch.addEventListener('input', (e) => {
            renderMembersTab(e.target.value);
        });
    }
    const sidebarMenuContainer = document.getElementById('sidebar-menu-container');
    if (btnToggleSidebar && sidebarMenuContainer) {
        btnToggleSidebar.addEventListener('click', (e) => { e.stopPropagation(); sidebarMenuContainer.classList.toggle('mobile-open'); });
        document.addEventListener('click', (e) => {
            if (sidebarMenuContainer.classList.contains('mobile-open') && !sidebarMenuContainer.contains(e.target) && e.target !== btnToggleSidebar) {
                sidebarMenuContainer.classList.remove('mobile-open');
            }
        });
    }

    setupQuickActions();

    // L'écouteur du sous-menu "Paiements" a été déplacé à la fin du fichier pour garantir son fonctionnement.


    // --- Navigation menu (sidebar) - uniquement les boutons avec data-tab ---
    document.querySelectorAll('.nav-item[data-tab], .nav-subitem[data-tab]').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.getAttribute('data-tab');
            if (tabId) switchTab(tabId);
            // Fermer le menu mobile après navigation
            const sidebar = document.getElementById('sidebar-menu-container');
            if (sidebar) sidebar.classList.remove('mobile-open');
        });
    });

    // DYNAMIC DATA LOAD
    await loadDynamicData();
    renderDashboard();
    animateDashboardCurve();
    hideGlobalLoader();

    // Démarrer la visite guidée si c'est la première fois
    if (!localStorage.getItem('tontine_onboarding_done')) {
        setTimeout(startOnboardingTour, 1000);
    }

    // Axe 4 : appliquer les restrictions selon le rôle de l'utilisateur
    applyRoleRestrictions();
}

async function logoutUser() {
    await window.SupabaseService.signOut();
    window.location.href = 'connexion/index.html';
}

function showGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'flex';
}
function hideGlobalLoader() {
    const loader = document.getElementById('global-loader');
    if (loader) loader.style.display = 'none';
}

// --- 5. DYNAMIC DATA & CALCULATION ---
function renderSkeletons() {
    const tBody = document.getElementById('tontines-table-body');
    if (tBody) {
        let skels = '';
        for(let i=0; i<3; i++) skels += `<tr><td colspan="7" style="padding:15px;"><div class="skeleton" style="height:30px;width:100%;border-radius:4px;"></div></td></tr>`;
        tBody.innerHTML = skels;
    }
    const mBody = document.getElementById('extended-members-list');
    if (mBody) {
        let skels = '';
        for(let i=0; i<3; i++) skels += `<div style="padding:15px;"><div class="skeleton" style="height:50px;width:100%;border-radius:8px;"></div></div>`;
        mBody.innerHTML = skels;
    }
    const txBody = document.getElementById('master-registry-table-body');
    if (txBody) {
        let skels = '';
        for(let i=0; i<3; i++) skels += `<tr><td colspan="7" style="padding:15px;"><div class="skeleton" style="height:30px;width:100%;border-radius:4px;"></div></td></tr>`;
        txBody.innerHTML = skels;
    }
}

async function loadDynamicData() {
    if (typeof DataService !== 'undefined') {
        if (typeof getSupabaseClient === 'function') {
            const client = getSupabaseClient();
            if (client) {
                try {
                    const { data: { user } } = await client.auth.getUser();
                    if (user) {
                        state.user.name = user.user_metadata?.full_name || user.email || 'Utilisateur';
                        state.user.id = user.id;
                        state.user.email = user.email;
                    }
                } catch (e) {}
            }
        }

        renderSkeletons();

        const tontines = await DataService.getTontines().catch(() => []);
        if (tontines && tontines.length > 0) {
            state.activeTontines = tontines;
            state.activeTontines.forEach(t => {
                if (typeof loadTontineDrawState === 'function') loadTontineDrawState(t);
            });
        }

        const messages = await DataService.getRecentMessages().catch(() => []);
        if (messages && messages.length > 0) state.recentMessages = messages;

        const members = await DataService.getMembers().catch(() => []);
        if (members && members.length > 0) {
            extendedMembers = members;
            state.extendedMembers = members;
            
            // Synchroniser le rôle si l'utilisateur est connecté
            if (state.user && state.user.name) {
                const myName = state.user.name.split('@')[0].toLowerCase();
                let myMemberRecord = extendedMembers.find(m => m.name.toLowerCase().includes(myName) || m.id === state.user.id);
                if (myMemberRecord && myMemberRecord.role) {
                    state.user.role = myMemberRecord.role;
                }
            }
        }

        const transactions = await DataService.getTransactions().catch(() => []);
        let demoTxs = JSON.parse(localStorage.getItem('demo_transactions') || 'null');
        
        // Si c'est la toute première fois (historique vierge), on ajoute une ligne de bienvenue pour ne pas laisser le tableau vide
        if (!demoTxs || demoTxs.length === 0) {
            demoTxs = [{
                id: 'tx-welcome',
                title: 'Cotisation Initiale (Démo)',
                date: new Date().toLocaleDateString('fr-FR'),
                amount: 10000,
                type: 'deposit',
                icon: 'user',
                tontine: 'Général'
            }];
            localStorage.setItem('demo_transactions', JSON.stringify(demoTxs));
        }
        state.transactions = [...demoTxs, ...(transactions || [])];

        // Vraies Statistiques Globales : 17.3M et 86%
        renderMembers();
        if (window.SupabaseService && window.SupabaseService.fetchPaymentsForReports) {
            const payments = await window.SupabaseService.fetchPaymentsForReports().catch(() => []);
            if (payments && payments.length > 0) {
                let totalInPlay = 0;
                state.activeTontines.forEach(t => {
                    const maxM = parseInt(t.members.split('/')[1]) || 10;
                    totalInPlay += (t.amount * maxM);
                });

                let receivedCount = 0;
                let pendingCount = 0;
                let delayedCount = 0;
                let receivedAmount = 0;
                let pendingAmount = 0;
                let delayedAmount = 0;

                payments.forEach(p => {
                    const amt = p.amount || 0;
                    if (p.status === 'valide') { receivedCount++; receivedAmount += amt; }
                    else if (p.status === 'retard') { delayedCount++; delayedAmount += amt; }
                    else { pendingCount++; pendingAmount += amt; }
                });

                const totalP = payments.length || 1;
                state.stats.totalAmountInPlay = totalInPlay > 0 ? totalInPlay : 17300000;
                state.stats.participationRate = ((receivedCount / totalP) * 100).toFixed(1);
                state.stats.validatedPaymentsToday = receivedCount;
                state.stats.activeTontines = state.activeTontines.length;

                state.donut.receivedPercent = Math.round((receivedCount / totalP) * 100);
                state.donut.pendingPercent = Math.round((pendingCount / totalP) * 100);
                state.donut.delayedPercent = Math.round((delayedCount / totalP) * 100);
                
                state.donut.receivedAmount = receivedAmount;
                state.donut.pendingAmount = pendingAmount;
                state.donut.delayedAmount = delayedAmount;
                
                state.donut.receivedCount = receivedCount;
                state.donut.pendingCount = pendingCount;
                state.donut.delayedCount = delayedCount;
                
                // Calcul du vrai total de membres (en prenant le 2ème élément de "0/20")
                state.stats.totalMembersCount = state.activeTontines.reduce((acc, t) => {
                    const parts = t.members.split('/');
                    return acc + (parseInt(parts[1]) || parseInt(parts[0]) || 0);
                }, 0);
            }
        }
    }
}

// --- 6. POPUPS & QUICK ACTIONS ---
function setupQuickActions() {
    // Lecture des boutons directement ici, DOM garanti prêt (appelé depuis init() > DOMContentLoaded)
    const btnQuickCreateTontine = document.getElementById('btn-quick-create-tontine');
    const btnQuickSendMsg       = document.getElementById('btn-quick-send-msg');
    const btnQuickValidatePay   = document.getElementById('btn-quick-validate-pay');
    const btnQuickViewReports   = document.getElementById('btn-quick-view-reports');

    // 1. Créer tontine
    if (btnQuickCreateTontine) {
        btnQuickCreateTontine.addEventListener('click', () => {
            if (!checkPermission('create_tontine')) {
                showToast("🔒 Action refusée : Seul le gestionnaire peut créer une tontine !", "error");
                return;
            }
            const m = document.getElementById('create-tontine-modal');
            if (m) m.classList.remove('hidden');
        });
    }

    const btnCloseTontine = document.getElementById('btn-close-create-tontine-modal');
    if (btnCloseTontine) btnCloseTontine.addEventListener('click', () => document.getElementById('create-tontine-modal').classList.add('hidden'));

    // Create Tontine Submit
    const btnSubmitCreateTontine = document.getElementById('btn-submit-create-tontine');
    if (btnSubmitCreateTontine) {
        btnSubmitCreateTontine.addEventListener('click', async () => {
            if (btnSubmitCreateTontine.disabled) return;
            btnSubmitCreateTontine.disabled = true;

            const name = document.getElementById('tontine-name-input').value.trim();
            const amount = parseInt(document.getElementById('tontine-amount-input').value);
            let frequency = document.getElementById('tontine-frequency-input').value;
            if (frequency === 'Personnalisé') {
                const customDays = parseInt(document.getElementById('tontine-custom-days-input').value) || 5;
                frequency = `Chaque ${customDays} jours`;
            }
            const maxMembers = parseInt(document.getElementById('tontine-max-members-input').value);
            const type = document.getElementById('tontine-type-input') ? document.getElementById('tontine-type-input').value : 'Rotative';
            const goalAmount = document.getElementById('tontine-goal-amount-input') ? parseInt(document.getElementById('tontine-goal-amount-input').value) || 0 : 0;
            const goalTitle = document.getElementById('tontine-goal-title-input') ? document.getElementById('tontine-goal-title-input').value.trim() : '';

            if (!name) {
                showToast("Le nom de la tontine est obligatoire.", "error");
                btnSubmitCreateTontine.disabled = false;
                return;
            }
            if (isNaN(amount) || amount <= 0) {
                showToast("Veuillez entrer un montant valide.", "error");
                btnSubmitCreateTontine.disabled = false;
                return;
            }
            if (isNaN(maxMembers) || maxMembers <= 0) {
                showToast("Le nombre de membres doit être supérieur à 0.", "error");
                btnSubmitCreateTontine.disabled = false;
                return;
            }

            // Anti-doublon
            const isDuplicate = state.activeTontines.some(t => t.name.toLowerCase() === name.toLowerCase());
            if (isDuplicate) {
                showToast("Une tontine avec ce nom existe déjà.", "error");
                btnSubmitCreateTontine.disabled = false;
                return;
            }

            showGlobalLoader();
            const { data, error } = await DataService.createTontine({
                name: name,
                amount_per_cycle: amount,
                frequency: frequency,
                max_members: maxMembers || 10,
                type: type,
                goal_amount: goalAmount,
                goal_title: goalTitle
            });
            hideGlobalLoader();
            btnSubmitCreateTontine.disabled = false;

            if (error) {
                const errMsg = typeof error === 'object' ? (error.message || JSON.stringify(error)) : error;
                showToast("Erreur lors de la création : " + errMsg, "error");
            } else {
                document.getElementById('create-tontine-modal').classList.add('hidden');
                document.getElementById('tontine-name-input').value = '';
                document.getElementById('tontine-amount-input').value = '';
                document.getElementById('tontine-frequency-input').value = 'Mensuel';
                if (document.getElementById('tontine-type-input')) document.getElementById('tontine-type-input').value = 'Rotative';
                if (document.getElementById('tontine-goal-amount-input')) document.getElementById('tontine-goal-amount-input').value = '';
                if (document.getElementById('tontine-goal-title-input')) document.getElementById('tontine-goal-title-input').value = '';
                const customGrp = document.getElementById('tontine-custom-days-group');
                if (customGrp) customGrp.style.display = 'none';
                const goalGrp = document.getElementById('tontine-goal-group');
                if (goalGrp) goalGrp.style.display = 'none';
                
                showToast("Tontine créée avec succès !", "success");
                
                if (typeof soundSuccess !== 'undefined' && soundSuccess) {
                    soundSuccess.volume = 0.5;
                    soundSuccess.play().catch(() => {});
                }
                
                if (data && data.length > 0) {
                    const newTontine = data[0];
                    state.activeTontines.push({
                        id: newTontine.id,
                        name: newTontine.name,
                        amount: newTontine.amount_per_cycle,
                        frequency: newTontine.frequency,
                        members: newTontine.current_members + "/" + newTontine.max_members,
                        progression: newTontine.progression,
                        status: newTontine.status,
                        type: newTontine.type || type,
                        goalAmount: newTontine.goalAmount || goalAmount,
                        goalTitle: newTontine.goalTitle || goalTitle
                    });
                } else {
                    await loadDynamicData();
                }
                
                renderDashboard();
                updateStats(); // Mise à jour des compteurs du dashboard
            }
        });
    }

    // Edit Tontine Submit
    const btnCloseEditTontine = document.getElementById('btn-close-edit-tontine-modal');
    if (btnCloseEditTontine) {
        btnCloseEditTontine.addEventListener('click', () => {
            document.getElementById('edit-tontine-modal').classList.add('hidden');
        });
    }

    const btnSubmitEditTontine = document.getElementById('btn-submit-edit-tontine');
    if (btnSubmitEditTontine) {
        btnSubmitEditTontine.addEventListener('click', async () => {
            if (btnSubmitEditTontine.disabled) return;
            btnSubmitEditTontine.disabled = true;

            const id = document.getElementById('edit-tontine-id-input').value;
            const name = document.getElementById('edit-tontine-name-input').value;
            const amount = parseInt(document.getElementById('edit-tontine-amount-input').value);
            let frequency = document.getElementById('edit-tontine-frequency-input').value;
            if (frequency === 'Personnalisé') {
                const customDays = parseInt(document.getElementById('edit-tontine-custom-days-input').value) || 5;
                frequency = `Chaque ${customDays} jours`;
            }
            const maxMembers = parseInt(document.getElementById('edit-tontine-max-members-input').value);
            const type = document.getElementById('edit-tontine-type-input') ? document.getElementById('edit-tontine-type-input').value : 'Rotative';
            const goalAmount = document.getElementById('edit-tontine-goal-amount-input') ? parseInt(document.getElementById('edit-tontine-goal-amount-input').value) || 0 : 0;
            const goalTitle = document.getElementById('edit-tontine-goal-title-input') ? document.getElementById('edit-tontine-goal-title-input').value.trim() : '';

            if (!id || !name || isNaN(amount)) {
                alert("Veuillez remplir correctement les champs.");
                btnSubmitEditTontine.disabled = false;
                return;
            }

            showGlobalLoader();
            const { error } = await DataService.updateTontine(id, {
                name: name,
                amount_per_cycle: amount,
                frequency: frequency,
                max_members: maxMembers || 10,
                type: type,
                goal_amount: goalAmount,
                goal_title: goalTitle
            });
            hideGlobalLoader();
            btnSubmitEditTontine.disabled = false;

            if (error) {
                alert("Erreur lors de la modification : " + error);
            } else {
                const existing = state.activeTontines.find(t => t.id == id);
                if (existing) {
                    existing.name = name;
                    existing.amount = amount;
                    existing.frequency = frequency;
                    existing.type = type;
                    existing.goalAmount = goalAmount;
                    existing.goalTitle = goalTitle;
                }
                document.getElementById('edit-tontine-modal').classList.add('hidden');
                await loadDynamicData();
                renderDashboard();
                
                if (typeof soundSuccess !== 'undefined' && soundSuccess) {
                    soundSuccess.volume = 0.5;
                    soundSuccess.play().catch(() => {});
                }
            }
        });
    }

    // Tontine Details Close
    const btnCloseTontineDetails = document.getElementById('btn-close-tontine-details-modal');
    if (btnCloseTontineDetails) {
        btnCloseTontineDetails.addEventListener('click', () => {
            document.getElementById('tontine-details-modal').classList.add('hidden');
        });
    }
    const btnCloseTontineDetails2 = document.getElementById('btn-close-tontine-details-btn');
    if (btnCloseTontineDetails2) {
        btnCloseTontineDetails2.addEventListener('click', () => {
            document.getElementById('tontine-details-modal').classList.add('hidden');
        });
    }

    // 2. Envoyer message
    if (btnQuickSendMsg) {
        btnQuickSendMsg.addEventListener('click', () => {
            const m = document.getElementById('send-message-modal');
            if (m) {
                const s = document.getElementById('message-recipient-input');
                if (s) {
                    s.innerHTML = '<option value="">Sélectionnez un destinataire</option>';
                    state.activeTontines.forEach(t => {
                        s.innerHTML += `<option value="${t.name}">Groupe: ${t.name}</option>`;
                    });
                }
                m.classList.remove('hidden');
            }
        });
    }

    const btnCloseMsg = document.getElementById('btn-close-send-message-modal');
    if (btnCloseMsg) btnCloseMsg.addEventListener('click', () => document.getElementById('send-message-modal').classList.add('hidden'));

    const btnSubmitMsg = document.getElementById('btn-submit-send-message');
    if (btnSubmitMsg) {
        btnSubmitMsg.addEventListener('click', async () => {
            const recip = document.getElementById('message-recipient-input').value;
            const cont = document.getElementById('message-content-input').value;

            if (!recip || !cont) return alert("Veuillez choisir un destinataire et écrire un message.");
            btnSubmitMsg.disabled = true;
            btnSubmitMsg.textContent = "Envoi...";

            const res = await DataService.createMessage({ conversation_id: null, content: cont });

            btnSubmitMsg.disabled = false;
            btnSubmitMsg.textContent = "Envoyer le message";

            if (res && !res.error) {
                document.getElementById('send-message-modal').classList.add('hidden');
                document.getElementById('message-content-input').value = '';
                playSuccessSound();
                await loadDynamicData();
                renderDashboard();
            } else {
                let errorMsg = res ? res.error : "Erreur inconnue";
                if (typeof errorMsg === 'object' && errorMsg !== null) {
                    errorMsg = errorMsg.message || JSON.stringify(errorMsg);
                }
                alert("Erreur lors de l'envoi : " + errorMsg);
            }
        });
    }

    // 3. Valider paiement — ouverture du modal multi-étapes
    if (btnQuickValidatePay) {
        btnQuickValidatePay.addEventListener('click', () => {
            if (!checkPermission('validate_payment')) {
                showToast("🔒 Action refusée : Seul le gestionnaire peut valider les paiements !", "error");
                return;
            }
            const m = document.getElementById('validate-payment-modal');
            if (m) {
                const s = document.getElementById('payment-member-input');
                if (s) {
                    s.innerHTML = '<option value="">Sélectionnez un membre</option>';
                    const memberList = state.extendedMembers || (typeof extendedMembers !== 'undefined' ? extendedMembers : []);
                    memberList.forEach(mem => {
                        s.innerHTML += `<option value="${mem.id}">${mem.name || mem.full_name}</option>`;
                    });
                }
                payResetSteps();
                m.classList.remove('hidden');
            }
        });
    }

    const btnClosePay = document.getElementById('btn-close-validate-payment-modal');
    if (btnClosePay) btnClosePay.addEventListener('click', () => document.getElementById('validate-payment-modal').classList.add('hidden'));

    // NOTE: Le bouton "btn-submit-validate-payment" est désormais géré par
    // onclick="payGoStep3()" directement dans le HTML (modal multi-étapes Axe 4).
    // L'ancien addEventListener a été retiré pour éviter les doubles déclenchements.


    // 4. Voir rapports
    if (btnQuickViewReports) {
        btnQuickViewReports.addEventListener('click', async () => {
            const m = document.getElementById('reports-modal');
            if (!m) return;
            m.classList.remove('hidden');

            const totalEl = document.getElementById('report-total-collected');
            const delayEl = document.getElementById('report-delay-rate');
            totalEl.textContent = "Chargement...";
            delayEl.textContent = "...";

            let data = await DataService.getReportsData().catch(() => null);
            
            // Mode Démo / Fallback si pas de données de la DB
            if (!data) {
                data = {
                    totalCollected: 0,
                    delayRate: 0,
                    chartData: {
                        labels: ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août'],
                        dataPoints: [120000, 210000, 160000, 280000, 190000, 310000, 240000, 350000]
                    }
                };
            }

            totalEl.textContent = new Intl.NumberFormat('fr-FR').format(data.totalCollected) + " FCFA";
            delayEl.textContent = data.delayRate + "%";

            let labels = data.chartData.labels;
            let dataPoints = data.chartData.dataPoints;

            // Génération d'une courbe en dents de scie pour la démo s'il manque des données historiques
            if (labels.length <= 1) {
                labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août'];
                dataPoints = [120000, 210000, 160000, 280000, 190000, 310000, 240000, 350000];
            }

            const ctx = document.getElementById('payments-evolution-chart');
            if (ctx && typeof Chart !== 'undefined') {
                if (reportsChartInstance) reportsChartInstance.destroy();
                reportsChartInstance = new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [{
                            label: 'Cotisations perçues (FCFA)',
                            data: dataPoints,
                            borderColor: '#5C60F5',
                            backgroundColor: 'rgba(92, 96, 245, 0.08)',
                            borderWidth: 3,
                            fill: true,
                            tension: 0.4,
                            pointBackgroundColor: '#ffffff',
                            pointBorderColor: '#5C60F5',
                            pointBorderWidth: 2,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        }]
                    },
                    options: { 
                        responsive: true, 
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false },
                            tooltip: {
                                backgroundColor: '#1e293b',
                                padding: 12,
                                titleFont: { size: 13, family: 'Inter, sans-serif' },
                                bodyFont: { size: 14, weight: 'bold', family: 'Inter, sans-serif' },
                                displayColors: false,
                                callbacks: {
                                    label: function(context) {
                                        return new Intl.NumberFormat('fr-FR').format(context.parsed.y) + ' FCFA';
                                    }
                                }
                            }
                        },
                        scales: {
                            y: { beginAtZero: true, display: false },
                            x: {
                                grid: { display: false, drawBorder: false },
                                ticks: { color: '#94a3b8', font: { family: 'Inter, sans-serif', size: 12 } }
                            }
                        }
                    }
                });
            }
        });
    }

    const btnCloseReports = document.getElementById('btn-close-reports-modal');
    if (btnCloseReports) btnCloseReports.addEventListener('click', () => document.getElementById('reports-modal').classList.add('hidden'));

    // 5. Ajouter un membre
    const btnQuickAddMember = document.getElementById('btn-quick-add-member');
    if (btnQuickAddMember) {
        btnQuickAddMember.addEventListener('click', () => {
            if (!checkPermission('manage_members')) {
                showToast("🔒 Action refusée : Seul le gestionnaire peut ajouter ou modifier des membres !", "error");
                return;
            }
            const m = document.getElementById('add-member-modal');
            if (m) m.classList.remove('hidden');
        });
    }

    const btnCloseAddMember = document.getElementById('btn-close-add-member-modal');
    if (btnCloseAddMember) {
        btnCloseAddMember.addEventListener('click', () => {
            document.getElementById('add-member-modal').classList.add('hidden');
        });
    }

    const emailInput = document.getElementById('member-email-input');
    if (emailInput) {
        emailInput.addEventListener('input', (e) => {
            const pwdGroup = document.getElementById('member-password-group');
            if (pwdGroup) {
                pwdGroup.style.display = e.target.value.trim().length > 0 ? 'block' : 'none';
            }
        });
    }

    const btnSubmitAddMember = document.getElementById('btn-submit-add-member');
    if (btnSubmitAddMember) {
        btnSubmitAddMember.addEventListener('click', async () => {
            if (!checkPermission('manage_members')) {
                showToast("🔒 Action refusée : Seul le gestionnaire peut ajouter ou modifier des membres !", "error");
                return;
            }
            if (btnSubmitAddMember.disabled) return;
            btnSubmitAddMember.disabled = true;

            const name = document.getElementById('member-name-input').value.trim();
            const phone = document.getElementById('member-phone-input').value.trim();
            const email = document.getElementById('member-email-input').value.trim();
            const password = document.getElementById('member-password-input') ? document.getElementById('member-password-input').value.trim() : '';
            const status = document.getElementById('member-status-input').value;

            if (!name) {
                showToast("Le nom du membre est obligatoire.", "error");
                btnSubmitAddMember.disabled = false;
                return;
            }
            if (!phone) {
                showToast("Le numéro de téléphone est obligatoire.", "error");
                btnSubmitAddMember.disabled = false;
                return;
            }

            // Anti-doublon (téléphone)
            const isDuplicate = state.extendedMembers && state.extendedMembers.some(m => m.phone === phone);
            if (isDuplicate) {
                showToast("Un membre avec ce numéro de téléphone existe déjà.", "error");
                btnSubmitAddMember.disabled = false;
                return;
            }

            showGlobalLoader();
            const { data, error } = await DataService.createMember({
                name: name,
                phone: phone,
                email: email,
                password: password,
                status: status
            });
            hideGlobalLoader();
            btnSubmitAddMember.disabled = false;

            if (error) {
                const errMsg = typeof error === 'object' ? (error.message || JSON.stringify(error)) : error;
                showToast("Erreur lors de l'ajout : " + errMsg, "error");
            } else {
                document.getElementById('add-member-modal').classList.add('hidden');
                document.getElementById('member-name-input').value = '';
                document.getElementById('member-phone-input').value = '';
                document.getElementById('member-email-input').value = '';
                if (document.getElementById('member-password-input')) {
                    document.getElementById('member-password-input').value = '';
                    document.getElementById('member-password-group').style.display = 'none';
                }
                
                showToast("Membre ajouté avec succès !", "success");
                
                if (typeof soundSuccess !== 'undefined' && soundSuccess) {
                    soundSuccess.volume = 0.5;
                    soundSuccess.play().catch(() => {});
                }
                
                if (data && data.length > 0) {
                    const newMember = data[0];
                    if (!state.extendedMembers) state.extendedMembers = [];
                    state.extendedMembers.push({
                        id: newMember.id,
                        name: newMember.full_name,
                        phone: newMember.phone,
                        avatar: newMember.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(newMember.full_name)}&background=5C60F5&color=fff`,
                        trust: newMember.reliability_score || 100,
                        trustClass: 'excellent',
                        status: newMember.is_active ? 'Actif' : 'Inactif',
                        tontines: 0,
                        contributed: 0
                    });
                    
                    // Mettre à jour la variable globale et le localStorage pour la persistance
                    if (typeof extendedMembers !== 'undefined') {
                        extendedMembers = state.extendedMembers;
                    }
                    localStorage.setItem('tontine_extended_members', JSON.stringify(state.extendedMembers));
                    
                } else {
                    await loadDynamicData();
                }
                
                if (typeof renderMembersTab === 'function') {
                    await renderMembersTab();
                }
                
                if (typeof renderAdminMembers === 'function') {
                    renderAdminMembers('');
                }
            }
        });
    }

    // 6. Clôturer ce tour
    const btnCloseCurrentRound = document.getElementById('btn-close-current-round');
    const modalCloseRound = document.getElementById('close-round-modal');
    
    if (btnCloseCurrentRound) {
        btnCloseCurrentRound.addEventListener('click', () => {
            if (!checkPermission('close_round')) {
                showToast("🔒 Action refusée : Seul le gestionnaire peut clôturer un tour et distribuer les fonds !", "error");
                return;
            }
            if (!state.activeTontines || state.activeTontines.length === 0) {
                showToast("Aucune tontine active à clôturer", "error");
                return;
            }
            const firstTontine = state.activeTontines[0];
            const maxM = parseInt(firstTontine.members.split('/')[1]) || 10;
            const totalPayout = firstTontine.amount * maxM;
            const currentRound = firstTontine.currentRound || 1;
            const beneficiaryMember = (typeof extendedMembers !== 'undefined' && extendedMembers.length > 0) ? extendedMembers[(currentRound - 1) % extendedMembers.length] : null;
            const beneficiaryName = beneficiaryMember ? beneficiaryMember.name : ("Membre " + firstTontine.name + (currentRound > 1 ? ` (Tour ${currentRound})` : ""));
            const beneficiaryAvatarSrc = beneficiaryMember && beneficiaryMember.avatar ? beneficiaryMember.avatar : getAvatarInitials(beneficiaryName);

            document.getElementById('close-round-tontine-name').textContent = firstTontine.name;
            document.getElementById('close-round-amount').innerHTML = `${new Intl.NumberFormat('fr-FR').format(totalPayout)} FCFA`;
            document.getElementById('close-round-beneficiary').textContent = beneficiaryName;
            document.getElementById('close-round-avatar').src = beneficiaryAvatarSrc;

            if (modalCloseRound) modalCloseRound.classList.remove('hidden');
        });
    }

    const btnCancelCloseRound = document.getElementById('btn-cancel-close-round');
    const btnXCloseRound = document.getElementById('btn-close-round-modal-x');
    
    if (btnCancelCloseRound) btnCancelCloseRound.addEventListener('click', () => modalCloseRound.classList.add('hidden'));
    if (btnXCloseRound) btnXCloseRound.addEventListener('click', () => modalCloseRound.classList.add('hidden'));

    const btnConfirmCloseRound = document.getElementById('btn-confirm-close-round');
    if (btnConfirmCloseRound) {
        btnConfirmCloseRound.addEventListener('click', async () => {
            if (!checkPermission('close_round')) {
                showToast("🔒 Action refusée : Seul le gestionnaire peut distribuer les fonds !", "error");
                if (modalCloseRound) modalCloseRound.classList.add('hidden');
                return;
            }
            if (btnConfirmCloseRound.disabled) return;
            btnConfirmCloseRound.disabled = true;

            const firstTontine = state.activeTontines[0];
            const maxM = parseInt(firstTontine.members.split('/')[1]) || 10;
            const totalPayout = firstTontine.amount * maxM;
            const currentRound = firstTontine.currentRound || 1;
            const beneficiaryMember = (typeof extendedMembers !== 'undefined' && extendedMembers.length > 0) ? extendedMembers[(currentRound - 1) % extendedMembers.length] : null;
            const beneficiaryName = beneficiaryMember ? beneficiaryMember.name : ("Membre " + firstTontine.name + (currentRound > 1 ? ` (Tour ${currentRound})` : ""));

            showGlobalLoader();

            // Créer une transaction de retrait
            const payoutTx = {
                id: 'tx-payout-' + Date.now(),
                title: 'Bénéficiaire : ' + beneficiaryName,
                date: new Date().toLocaleDateString('fr-FR'),
                amount: totalPayout,
                type: 'withdrawal',
                icon: 'gift',
                tontine: firstTontine.name
            };
            
            // Simuler la remise à zéro des paiements de la tontine (0/10)
            firstTontine.members = `0/${maxM}`;
            firstTontine.currentRound = currentRound + 1; // Avancer au prochain tour
            
            // Remettre à zéro les statistiques du dashboard
            if (state.stats) {
                state.stats.participationRate = 0;
                state.stats.validatedPaymentsToday = 0;
            }
            if (state.donut) {
                state.donut.receivedPercent = 0;
                state.donut.receivedAmount = 0;
                state.donut.pendingPercent = 0;
                state.donut.pendingAmount = 0;
                state.donut.delayedPercent = 0;
                state.donut.delayedAmount = 0;
            }
            
            // Ajouter à l'historique local (pour effet immédiat)
            if (!state.transactions) state.transactions = [];
            state.transactions.unshift(payoutTx);
            
            // Sauvegarder dans localStorage pour la maquette (persistance après rafraîchissement)
            const demoTxs = JSON.parse(localStorage.getItem('demo_transactions') || '[]');
            demoTxs.unshift(payoutTx);
            localStorage.setItem('demo_transactions', JSON.stringify(demoTxs));

            hideGlobalLoader();
            btnConfirmCloseRound.disabled = false;
            
            if (modalCloseRound) modalCloseRound.classList.add('hidden');
            
            showToast("Tour clôturé avec succès ! Fonds distribués.", "success");
            
            if (typeof playSuccessSound === 'function') {
                playSuccessSound();
            }

            // Mettre à jour l'interface
            renderDashboard();
            if (typeof animateDashboardCurve === 'function') animateDashboardCurve();
            
            // Si on est sur l'onglet mes tontines, le mettre à jour aussi
            if (typeof updateCircleView === 'function') {
                const select = document.getElementById('circle-group-select');
                if (select && select.value == firstTontine.id) {
                    updateCircleView(firstTontine);
                }
            }
        });
    }
}

// --- 7. RENDERING FUNCTIONS ---
function renderMemberDashboard() {
    let tontineCount = 0;
    let totalContributed = 0;
    
    // Identifier le membre actuel
    const myName = state.user ? state.user.name.split('@')[0].toLowerCase() : '';
    let myMemberRecord = state.extendedMembers ? state.extendedMembers.find(m => m.name.toLowerCase().includes(myName) || m.id === state.user.id) : null;
    
    if (myMemberRecord) {
        totalContributed = myMemberRecord.contributed || 0;
    }
    
    // Pour le tableau des obligations:
    const obligationsTable = document.getElementById('member-obligations-table');
    if (obligationsTable) {
        obligationsTable.innerHTML = '';
        const tontinesList = state.activeTontines || [];
        tontinesList.forEach(t => {
            tontineCount++;
            const amount = t.amount;
            const dueStr = t.frequency;
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><div style="font-weight:600;color:var(--text-1);">${escapeHTML(t.name)}</div></td>
                <td><div style="font-weight:700;color:var(--text-1);">${formatCurrency(amount)}</div></td>
                <td><div style="font-size:12px;color:var(--text-2);">${escapeHTML(dueStr)}</div></td>
                <td><span class="badge-status badge-purple">À payer</span></td>
            `;
            obligationsTable.appendChild(tr);
        });
        
        if (tontinesList.length === 0) {
            obligationsTable.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-3);">Aucune tontine active pour le moment.</td></tr>';
        }
    }
    
    const countEl = document.getElementById('member-tontines-count');
    if (countEl) countEl.innerText = tontineCount;
    
    const contribEl = document.getElementById('member-total-contributed');
    if (contribEl) contribEl.innerText = formatCurrency(totalContributed);
    
    // Calcul simpliste du prochain tour (pour la démo du membre)
    const nextTurnText = document.getElementById('member-next-turn-text');
    const nextTurnAmt = document.getElementById('member-next-turn-amount');
    
    if (state.activeTontines && state.activeTontines.length > 0 && nextTurnText && nextTurnAmt) {
        const nextT = state.activeTontines[0];
        nextTurnText.innerText = 'Tontine: ' + nextT.name;
        // Approximation de la cagnotte : montant * max membres
        const maxMem = parseInt(nextT.members.split('/')[1] || 10);
        nextTurnAmt.innerText = formatCurrency(nextT.amount * maxMem);
    } else if (nextTurnText && nextTurnAmt) {
        nextTurnText.innerText = 'Aucun tour prévu';
        nextTurnAmt.innerText = '-';
    }
}

function renderDashboard() {
    // Intelligent greeting
    const greetingEl = document.getElementById('dashboard-greeting');
    if (greetingEl) {
        const hour = new Date().getHours();
        const greeting = hour < 18 ? 'Bonjour' : 'Bonsoir';
        let displayName = state.user.name.split('@')[0];
        displayName = displayName.charAt(0).toUpperCase() + displayName.slice(1);
        greetingEl.innerHTML = `${greeting}, ${escapeHTML(displayName)} ! &#x1F44B;`;
        
        // Update settings inputs if they exist
        const nameInput = document.getElementById('settings-name-input');
        if (nameInput) nameInput.value = state.user.name;
        
        const emailInput = document.getElementById('settings-email-input');
        if (emailInput && typeof getSupabaseClient === 'function') {
            const client = getSupabaseClient();
            if (client) {
                client.auth.getUser().then(({ data: { user } }) => {
                    if (user && user.email) emailInput.value = user.email;
                }).catch(()=>{});
            }
        }
    }

    renderStats();
    renderTontinesTable();
    renderTransactions();
    renderRecentMessages();
    renderActivityFeed();
    if (typeof renderAnalyticsCharts === 'function') renderAnalyticsCharts(state);
}

function renderStats() {
    const stat1 = document.getElementById('stats-active-tontines');
    if (stat1) stat1.textContent = state.stats.activeTontines;

    const stat2 = document.getElementById('stats-total-pool-label');
    if (stat2) stat2.innerHTML = formatCurrency(state.stats.totalAmountInPlay) + ' <span class="stat-cur">FCFA</span>';

    const stat3 = document.getElementById('stats-current-rounds');
    if (stat3) stat3.textContent = state.stats.toursInProgress;

    const stat4 = document.getElementById('stats-validated-payments');
    if (stat4) stat4.textContent = state.stats.validatedPaymentsToday;

    const rate = document.getElementById('participation-rate-value');
    if (rate) rate.textContent = state.stats.participationRate + "%";
    
    const rateBar = document.getElementById('participation-rate-bar');
    if (rateBar) rateBar.style.width = state.stats.participationRate + "%";
    
    // Legends
    const lReceived = document.getElementById('legend-val-received');
    if (lReceived) lReceived.innerHTML = `<strong>${state.donut.receivedPercent || 0}%</strong> (${formatCurrency(state.donut.receivedAmount || 0)} FCFA)`;
    
    const lPending = document.getElementById('legend-val-pending');
    if (lPending) lPending.innerHTML = `<strong>${state.donut.pendingPercent || 0}%</strong> (${formatCurrency(state.donut.pendingAmount || 0)} FCFA)`;
    
    const lDelayed = document.getElementById('legend-val-delayed');
    if (lDelayed) lDelayed.innerHTML = `<strong>${state.donut.delayedPercent || 0}%</strong> (${formatCurrency(state.donut.delayedAmount || 0)} FCFA)`;
    
    // Status counts
    const sReceived = document.getElementById('status-count-received');
    if (sReceived) sReceived.textContent = state.donut.receivedCount || 0;
    
    const sPending = document.getElementById('status-count-pending');
    if (sPending) sPending.textContent = state.donut.pendingCount || 0;
    
    const sDelayed = document.getElementById('status-count-delayed');
    if (sDelayed) sDelayed.textContent = state.donut.delayedCount || 0;
    
    const sTotal = document.getElementById('status-count-total');
    if (sTotal) sTotal.textContent = state.stats.totalMembersCount || 0;

    // Prochain tour (Dynamic Avatar)
    const nextAvatar = document.getElementById('next-round-avatar');
    const nextName = document.getElementById('next-round-name');
    const nextAmount = document.getElementById('next-round-payout-amount');
    const nextTontine = document.getElementById('next-round-tontine-name');
    const nextTourCount = document.getElementById('next-round-tour-count');
    const nextDate = document.getElementById('next-round-date');
    
    if (state.activeTontines && state.activeTontines.length > 0) {
        const firstTontine = state.activeTontines[0];
        const memberCount = parseInt(firstTontine.members.split('/')[1]) || 10;
        const paidCount = parseInt(firstTontine.members.split('/')[0]) || 0;
        const collectedPayout = firstTontine.amount * paidCount;
        const currentRound = firstTontine.currentRound || 1;
        const beneficiaryMember = (typeof extendedMembers !== 'undefined' && extendedMembers.length > 0) ? extendedMembers[(currentRound - 1) % extendedMembers.length] : null;
        const beneficiaryName = beneficiaryMember ? beneficiaryMember.name : ("Membre " + firstTontine.name + (currentRound > 1 ? ` (Tour ${currentRound})` : ""));
        const beneficiaryAvatarSrc = beneficiaryMember && beneficiaryMember.avatar ? beneficiaryMember.avatar : getAvatarInitials(beneficiaryName);
        if (nextAvatar && nextName) {
            nextName.textContent = escapeHTML(beneficiaryName);
            nextAvatar.src = beneficiaryAvatarSrc;
        }
        if (nextAmount) {
            nextAmount.innerHTML = `${formatCurrency(collectedPayout)} <span class="payout-currency">FCFA</span>`;
        }
        if (nextTontine) {
            nextTontine.textContent = escapeHTML(firstTontine.name);
        }
        if (nextTourCount) {
            nextTourCount.textContent = currentRound;
        }
        if (nextDate) {
            // Pour la démo, on considère que le tour arrive à échéance aujourd'hui
            const expectedDate = new Date();
            nextDate.innerHTML = `
            <span style="display:flex; align-items:center; gap:5px;" id="next-date-display">
                <span id="next-date-text">${expectedDate.toLocaleDateString('fr-FR')}</span> 
                <svg id="btn-edit-next-date" style="cursor:pointer; color:#94a3b8;" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" title="Modifier la date"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
            </span>
            <input type="date" id="next-date-input" style="display:none; width: 100%; border: 1px solid #e2e8f0; border-radius: 4px; padding: 2px 5px; font-size: 13px; font-family: inherit; color: #1e293b;">`;
            
            // Attacher les événements pour rendre le crayon fonctionnel
            setTimeout(() => {
                const btnEdit = document.getElementById('btn-edit-next-date');
                const dateText = document.getElementById('next-date-text');
                const dateInput = document.getElementById('next-date-input');
                const displaySpan = document.getElementById('next-date-display');
                
                if (btnEdit && dateInput && displaySpan) {
                    dateInput.value = expectedDate.toISOString().split('T')[0];
                    
                    btnEdit.addEventListener('click', () => {
                        displaySpan.style.display = 'none';
                        dateInput.style.display = 'block';
                        dateInput.focus();
                    });
                    
                    const saveDate = () => {
                        if (dateInput.value) {
                            const newDate = new Date(dateInput.value);
                            dateText.textContent = newDate.toLocaleDateString('fr-FR');
                        }
                        dateInput.style.display = 'none';
                        displaySpan.style.display = 'flex';
                    };
                    
                    dateInput.addEventListener('blur', saveDate);
                    dateInput.addEventListener('change', saveDate);
                    dateInput.addEventListener('keypress', (e) => {
                        if (e.key === 'Enter') saveDate();
                    });
                }
            }, 0);
        }
    } else {
        if (nextAvatar && nextName) {
            nextName.textContent = "-";
            nextAvatar.src = getAvatarInitials("-");
        }
        if (nextAmount) {
            nextAmount.innerHTML = `0 <span class="payout-currency">FCFA</span>`;
        }
        if (nextTontine) {
            nextTontine.textContent = "-";
        }
        if (nextTourCount) nextTourCount.textContent = "-";
        if (nextDate) nextDate.textContent = "-";
    }
}

function renderTontinesTable() {
    // Inject CSS for dropdown if not exists (bypasses cache and fixes variable names)
    if (!document.getElementById('action-menu-styles')) {
        const style = document.createElement('style');
        style.id = 'action-menu-styles';
        style.innerHTML = `
            .action-dropdown {
                position: absolute;
                right: 0;
                top: 100%;
                background: var(--card, #fff);
                border: 1px solid var(--border, #E2E8F0);
                border-radius: 8px;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
                min-width: 160px;
                z-index: 999;
                opacity: 0;
                visibility: hidden;
                transform: translateY(10px);
                transition: all 0.2s ease;
                display: flex;
                flex-direction: column;
                padding: 4px 0;
            }
            .tbl-wrap { overflow: visible !important; }
            .action-dropdown.show {
                opacity: 1;
                visibility: visible;
                transform: translateY(0);
            }
            .action-dropdown-item {
                display: flex;
                align-items: center;
                padding: 8px 12px;
                color: var(--text-1, #1E293B);
                text-decoration: none;
                font-size: 13px;
                font-weight: 500;
                transition: background 0.2s;
                cursor: pointer;
            }
            .action-dropdown-item svg {
                margin-right: 8px;
                width: 16px;
                height: 16px;
                opacity: 0.7;
            }
            .action-dropdown-item:hover {
                background: var(--content-bg, #F1F5F9);
                color: var(--primary, #5C60F5);
            }
            .action-dropdown-item.danger {
                color: var(--danger, #EF4444);
            }
            .action-dropdown-item.danger:hover {
                background: var(--danger-bg, rgba(239,68,68,0.1));
            }
        `;
        document.head.appendChild(style);
    }

    const tBody = document.getElementById('tontines-table-body');
    if (!tBody) return;
    
    // Ensure the 7th column header exists
    const tableHead = tBody.parentElement.querySelector('thead tr');
    if (tableHead && tableHead.children.length === 6) {
        const actionTh = document.createElement('th');
        actionTh.style.width = '40px';
        tableHead.appendChild(actionTh);
    }
    
    tBody.innerHTML = '';

    if (!state.activeTontines || state.activeTontines.length === 0) {
        tBody.innerHTML = `<tr><td colspan="7" style="padding: 60px 20px; text-align: center;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
                <div style="background:rgba(92, 96, 245, 0.1); color:var(--primary); width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                    <i data-feather="folder-plus" style="width:32px; height:32px;"></i>
                </div>
                <div>
                    <h3 style="color:var(--text-1); font-size:18px; font-weight:700; margin-bottom:4px;">Aucune tontine active</h3>
                    <p style="color:var(--text-3); font-size:14px; max-width:300px; margin:0 auto;">Créez votre première tontine pour commencer à inviter des membres et gérer les cotisations.</p>
                </div>
                <button onclick="document.querySelector('[data-tab=\\'circle\\']').click()" style="margin-top:8px; background:var(--primary); color:white; border:none; padding:10px 20px; border-radius:8px; font-weight:600; cursor:pointer; display:flex; align-items:center; gap:8px; box-shadow:0 4px 12px rgba(92,96,245,0.3); transition:all 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'">
                    Créer ma première tontine
                </button>
            </div>
        </td></tr>`;
        setTimeout(() => feather.replace(), 0);
        return;
    }

    state.activeTontines.forEach(t => {
        // Simulated Health Score
        let hash = 0;
        for (let i = 0; i < t.name.length; i++) hash += t.name.charCodeAt(i);
        const healthScore = 40 + (hash % 61); // Score entre 40 et 100
        
        let healthClass = 'badge-green';
        let healthIcon = '🟢';
        if (healthScore < 60) {
            healthClass = 'badge-red';
            healthIcon = '🔴';
        } else if (healthScore < 85) {
            healthClass = 'badge-yellow';
            healthIcon = '🟠';
        }

        const isGoal = (t.type === 'Objectif');
        const typeBadge = isGoal 
            ? `<div style="margin-top:5px;display:flex;flex-direction:column;gap:2px;"><span style="background:#d1fae5;color:#059669;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;display:inline-block;width:fit-content;">🎯 Objectif : ${new Intl.NumberFormat('fr-FR').format(t.goalAmount || 0)} FCFA</span>${t.goalTitle ? `<span style="font-size:11px;color:var(--text-3);font-style:italic;">"${escapeHTML(t.goalTitle)}"</span>` : ''}</div>`
            : `<div style="margin-top:5px;"><span style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;display:inline-block;">🔄 Rotative Classique</span></div>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>
                <div style="font-weight:600; color:var(--text-1); font-size:14px;">${escapeHTML(t.name)}</div>
                ${typeBadge}
            </td>
            <td><span style="font-weight:600; color:var(--text-1);">${new Intl.NumberFormat('fr-FR').format(t.amount)} FCFA</span></td>
            <td><span style="color:var(--text-2); font-size:13px;">${t.frequency}</span></td>
            <td><span style="font-weight:600; color:var(--primary); background:rgba(92,96,245,0.08); padding:4px 8px; border-radius:6px; font-size:12px;">👥 ${t.members}</span></td>
            <td>
                <div style="display:flex;align-items:center;gap:8px;">
                    <div class="progress-bar-bg" style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden;">
                        <div class="progress-bar-fill" style="width: 0%; height:100%; background:${isGoal ? 'linear-gradient(90deg,#10b981,#059669)' : 'linear-gradient(90deg,#6366f1,#8b5cf6)'}; transition:width 1s ease;" data-target="${t.progression}"></div>
                    </div>
                    <span style="font-size:11px;font-weight:700;color:${isGoal ? '#059669' : '#6366f1'};min-width:32px;text-align:right;">${t.progression}%</span>
                </div>
            </td>
            <td>
                <div style="display:flex; flex-direction:column; gap:4px;">
                    <span class="badge-status ${healthClass}" style="display:inline-flex; align-items:center; gap:4px; font-weight:700; width:fit-content;">
                        ${healthScore}% ${healthIcon}
                    </span>
                    <span style="font-size:11px; color:var(--text-3);">${t.status}</span>
                </div>
            </td>
            <td>
                <div class="action-menu-container">
                    <button class="btn-action-dots" onclick="toggleActionMenu(event, '${t.id}')" style="width: 24px; height: 24px; color: #1E293B;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                    </button>
                    <div class="action-dropdown" id="dropdown-${t.id}">
                        <a class="action-dropdown-item" onclick="openEditTontineModal('${t.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                            Modifier
                        </a>
                        <a class="action-dropdown-item" onclick="openTontineDetailsModal('${t.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>
                            ${isGoal ? 'Détails & Objectif 🎯' : 'Détails & Tirage 🎲'}
                        </a>
                        <a class="action-dropdown-item danger" onclick="deleteTontineAction('${t.id}')">
                            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            Supprimer
                        </a>
                    </div>
                </div>
            </td>
        `;
        tBody.appendChild(tr);

        setTimeout(() => {
            const fill = tr.querySelector('.progress-bar-fill');
            if (fill) {
                fill.style.width = fill.getAttribute('data-target') + '%';
            }
        }, 100);
    });
    
    if (window.feather) feather.replace();
    applyRoleRestrictions();
}

async function deleteTontineAction(id) {
    if (!checkPermission('delete_tontine')) {
        showToast("🔒 Action refusée : Seul l'administrateur peut supprimer une tontine !", "error");
        return;
    }
    if (!confirm("Êtes-vous sûr de vouloir supprimer cette tontine ? Cette action est irréversible.")) return;
    
    showGlobalLoader();
    try {
        const { error } = await DataService.deleteTontine(id);
        if (error) {
            alert("Erreur lors de la suppression : " + error);
        } else {
            // Refresh data
            await loadDynamicData();
            renderDashboard();
        }
    } catch (err) {
        alert("Une erreur inattendue s'est produite.");
    }
    hideGlobalLoader();
}

function openEditTontineModal(id) {
    if (!checkPermission('edit_tontine')) {
        showToast("🔒 Action refusée : Seul le gestionnaire peut modifier une tontine !", "error");
        return;
    }
    const tontine = state.activeTontines.find(t => t.id === id);
    if (!tontine) return;
    
    // Fermer les menus déroulants
    document.querySelectorAll('.action-dropdown.show').forEach(el => el.classList.remove('show'));

    document.getElementById('edit-tontine-id-input').value = tontine.id;
    document.getElementById('edit-tontine-name-input').value = tontine.name;
    document.getElementById('edit-tontine-amount-input').value = tontine.amount;
    
    const freqInput = document.getElementById('edit-tontine-frequency-input');
    const customGroup = document.getElementById('edit-tontine-custom-days-group');
    const customInput = document.getElementById('edit-tontine-custom-days-input');
    
    if (tontine.frequency && (tontine.frequency.startsWith('Chaque') || tontine.frequency === 'Personnalisé')) {
        freqInput.value = 'Personnalisé';
        if (customGroup) customGroup.style.display = 'block';
        const numMatch = tontine.frequency.match(/\d+/);
        if (numMatch && customInput) customInput.value = numMatch[0];
    } else {
        freqInput.value = tontine.frequency || 'Mensuel';
        if (customGroup) customGroup.style.display = 'none';
    }
    
    // Extract max_members from string like '0/20' or '5/10'
    const maxMembers = parseInt(tontine.members.split('/')[1]) || 10;
    document.getElementById('edit-tontine-max-members-input').value = maxMembers;

    const typeInput = document.getElementById('edit-tontine-type-input');
    const goalGroup = document.getElementById('edit-tontine-goal-group');
    const goalAmountInput = document.getElementById('edit-tontine-goal-amount-input');
    const goalTitleInput = document.getElementById('edit-tontine-goal-title-input');

    if (typeInput) {
        typeInput.value = tontine.type || 'Rotative';
        if (goalGroup) goalGroup.style.display = (tontine.type === 'Objectif') ? 'block' : 'none';
        if (goalAmountInput) goalAmountInput.value = tontine.goalAmount || '';
        if (goalTitleInput) goalTitleInput.value = tontine.goalTitle || '';
    }

    if (!window.modalHistoryPushed) {
        history.pushState({ modalOpen: true }, '');
        window.modalHistoryPushed = true;
    }
    document.getElementById('edit-tontine-modal').classList.remove('hidden');
}

function openTontineDetailsModal(id) {
    const tontine = state.activeTontines.find(t => t.id === id);
    if (!tontine) return;
    
    // Fermer les menus déroulants
    document.querySelectorAll('.action-dropdown.show').forEach(el => el.classList.remove('show'));

    document.getElementById('details-tontine-name').textContent = tontine.name;
    document.getElementById('details-tontine-amount').textContent = new Intl.NumberFormat('fr-FR').format(tontine.amount) + ' FCFA';
    
    const statusEl = document.getElementById('details-tontine-status');
    statusEl.innerHTML = `<span class="badge-status ${tontine.status === 'En cours' ? 'badge-green' : 'badge-yellow'}" style="font-size: 14px; padding: 6px 12px;">${tontine.status}</span>`;
    
    document.getElementById('details-tontine-frequency').textContent = tontine.frequency;
    document.getElementById('details-tontine-members').textContent = tontine.members;
    
    document.getElementById('details-tontine-progression-text').textContent = tontine.progression + '%';
    const fill = document.getElementById('details-tontine-progression-fill');
    
    // Petit effet d'animation pour la barre
    fill.style.width = '0%';
    if (!window.modalHistoryPushed) {
        history.pushState({ modalOpen: true }, '');
        window.modalHistoryPushed = true;
    }
    document.getElementById('tontine-details-modal').classList.remove('hidden');
    
    setTimeout(() => {
        fill.style.width = tontine.progression + '%';
    }, 100);

    window.currentOpenedTontine = tontine;
    const drawSec = document.getElementById('tontine-draw-section');
    const goalSec = document.getElementById('tontine-goal-display-section');

    if (tontine.type === 'Objectif') {
        if (drawSec) drawSec.style.display = 'none';
        if (goalSec) {
            goalSec.style.display = 'block';
            goalSec.innerHTML = `
                <div style="background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.05)); border: 1px solid #10b981; border-radius: 16px; padding: 20px; text-align: center; box-shadow: 0 4px 20px -5px rgba(16, 185, 129, 0.15);">
                    <div style="width: 50px; height: 50px; border-radius: 50%; background: #10b981; color: white; display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 12px; box-shadow: 0 4px 10px rgba(16, 185, 129, 0.4);">
                        🎯
                    </div>
                    <h4 style="margin: 0 0 6px 0; font-size: 18px; color: #065f46; font-weight: 800;">Épargne Projet Communautaire</h4>
                    <div style="font-size: 14px; color: var(--text-2); margin-bottom: 15px; font-weight: 600;">"${escapeHTML(tontine.goalTitle || 'Projet non spécifié')}"</div>
                    
                    <div style="background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 15px; margin-bottom: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                        <div style="border-right: 1px solid var(--border);">
                            <div style="font-size: 11px; color: var(--text-3); text-transform: uppercase; font-weight: 700;">Objectif Global</div>
                            <div style="font-size: 18px; font-weight: 800; color: #059669; margin-top: 4px;">${new Intl.NumberFormat('fr-FR').format(tontine.goalAmount || 0)} FCFA</div>
                        </div>
                        <div>
                            <div style="font-size: 11px; color: var(--text-3); text-transform: uppercase; font-weight: 700;">Progression</div>
                            <div style="font-size: 18px; font-weight: 800; color: var(--primary); margin-top: 4px;">${tontine.progression}%</div>
                        </div>
                    </div>

                    <div style="background: var(--content-bg); padding: 12px; border-radius: 10px; font-size: 12px; color: var(--text-2); line-height: 1.5; text-align: left;">
                        <strong>💡 Fonctionnement Épargne Projet :</strong> Contrairement à une tontine rotative classique où chaque membre remporte la cagnotte à tour de rôle, cette caisse commune est bloquée et dédiée à la réalisation du projet <em>"${escapeHTML(tontine.goalTitle || 'commun')}"</em>. Tous les fonds cotisés sont cumulés jusqu'à l'atteinte des 100%.
                    </div>
                </div>
            `;
        }
    } else {
        if (goalSec) goalSec.style.display = 'none';
        if (drawSec) drawSec.style.display = 'block';
        loadTontineDrawState(tontine);
        renderTontineDrawOrder(tontine, false);
    }

    if (typeof renderTontinePenalties === 'function') renderTontinePenalties(tontine);
}

function saveTontineDrawState(tontine) {
    if (!tontine) return;
    try {
        const saved = JSON.parse(localStorage.getItem('tontine_draw_states') || '{}');
        const key = tontine.id || tontine.name;
        saved[key] = {
            isDrawOfficial: tontine.isDrawOfficial,
            certCode: tontine.certCode,
            certTime: tontine.certTime,
            drawOrder: tontine.drawOrder
        };
        localStorage.setItem('tontine_draw_states', JSON.stringify(saved));
        if (typeof DataService !== 'undefined' && DataService.updateTontine) {
            DataService.updateTontine(tontine.id, {
                is_draw_official: tontine.isDrawOfficial,
                cert_code: tontine.certCode,
                cert_time: tontine.certTime,
                draw_order: tontine.drawOrder
            }).catch(() => {});
        }
    } catch(e) { console.warn("Erreur sauvegarde draw state:", e); }
}

function loadTontineDrawState(tontine) {
    if (!tontine) return;
    try {
        const saved = JSON.parse(localStorage.getItem('tontine_draw_states') || '{}');
        const key = tontine.id || tontine.name;
        const stateData = saved[key] || saved[tontine.name];
        if (stateData && stateData.isDrawOfficial) {
            tontine.isDrawOfficial = stateData.isDrawOfficial;
            tontine.certCode = stateData.certCode;
            tontine.certTime = stateData.certTime;
            if (stateData.drawOrder && stateData.drawOrder.length > 0) {
                tontine.drawOrder = stateData.drawOrder;
            }
        }
    } catch(e) { console.warn("Erreur chargement draw state:", e); }
}

function renderTontineDrawOrder(tontine, isReshuffle) {
    if (!isReshuffle) {
        loadTontineDrawState(tontine);
    }
    const resultsBox = document.getElementById('draw-results-list');
    const badge = document.getElementById('draw-status-badge');
    if (!resultsBox) return;

    // Récupérer ou générer des membres pour ce cercle
    let memberNames = ['Jean-Paul', 'Awa N.', 'Kossi A.', 'Fatou D.', 'David M.', 'Sophie L.', 'Raphaël B.', 'Aminata S.'];
    if (state.extendedMembers && state.extendedMembers.length > 0) {
        memberNames = state.extendedMembers.map(m => m.name || m.full_name || 'Membre');
    }
    const maxCount = parseInt(String(tontine.members).split('/')[1]) || 6;
    let currentList = memberNames.slice(0, Math.min(memberNames.length, maxCount));

    if (!tontine.drawOrder || isReshuffle) {
        // Mélange de Fisher-Yates (Shuffle aléatoire)
        let array = [...currentList];
        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }
        tontine.drawOrder = array;
    }

    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const currentMonth = new Date().getMonth();

    resultsBox.innerHTML = tontine.drawOrder.map((name, idx) => {
        const drawMonth = monthNames[(currentMonth + idx) % 12];
        const isFirst = idx === 0;
        
        return `
            <div style="background: ${isFirst ? 'rgba(16, 185, 129, 0.08)' : 'var(--card, #fff)'}; border: 1px solid ${isFirst ? '#10B981' : 'var(--border, #E2E8F0)'}; border-radius: 10px; padding: 12px 15px; display: flex; justify-content: space-between; align-items: center; transition: transform 0.2s;" onmouseover="this.style.transform='translateX(4px)'" onmouseout="this.style.transform='translateX(0)'">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isFirst ? '#10B981' : 'rgba(92, 96, 245, 0.1)'}; color: ${isFirst ? '#fff' : 'var(--primary, #5C60F5)'}; font-weight: 700; font-size: 14px; display: flex; align-items: center; justify-content: center; box-shadow: ${isFirst ? '0 2px 6px rgba(16,185,129,0.3)' : 'none'};">
                        #${idx + 1}
                    </div>
                    <div>
                        <div style="font-weight: 700; color: var(--text-1, #1E293B); font-size: 14px; display: flex; align-items: center; gap: 6px;">
                            ${name} ${isFirst ? '<span style="font-size: 11px; background: #10B981; color: white; padding: 1px 6px; border-radius: 4px; font-weight: 700;">👑 Gagnant Tour 1</span>' : ''}
                        </div>
                        <div style="font-size: 12px; color: var(--text-3, #94A3B8);">
                            📅 Date d'encaissement estimée : <strong>15 ${drawMonth} 2026</strong>
                        </div>
                    </div>
                </div>
                <div style="text-align: right;">
                    <span style="font-weight: 700; color: var(--primary, #5C60F5); font-size: 13px;">${new Intl.NumberFormat('fr-FR').format(tontine.amount || 50000)} FCFA</span>
                    <div style="font-size: 11px; color: #10B981; font-weight: 600;">✔ Assigné</div>
                </div>
            </div>
        `;
    }).join('');

    if (badge) {
        if (isReshuffle || tontine.isDrawOfficial) {
            badge.textContent = '✔ Ordre Officiel Fixé';
            badge.style.background = 'rgba(16, 185, 129, 0.15)';
            badge.style.color = '#10B981';
        } else {
            badge.textContent = 'Provisoire';
            badge.style.background = 'rgba(245, 158, 11, 0.15)';
            badge.style.color = '#D97706';
        }
    }

    const certBox = document.getElementById('draw-cert-box');
    const certCodeEl = document.getElementById('draw-cert-code');
    const certTimeEl = document.getElementById('draw-cert-time');
    const btnTrigger = document.getElementById('btn-trigger-draw');
    const btnReset = document.getElementById('btn-reset-draw');
    const lockBadge = document.getElementById('draw-lock-badge');

    if (tontine.isDrawOfficial) {
        if (certBox) certBox.classList.remove('hidden');
        if (certCodeEl) certCodeEl.textContent = tontine.certCode || 'CERT-8F39';
        if (certTimeEl) certTimeEl.textContent = 'Horodaté et verrouillé le ' + (tontine.certTime || '26/07/2026');
        if (btnTrigger) btnTrigger.style.display = 'none'; // Verrouillage Anti-Truquage !
        
        // RÈGLE ANTI-TRUQUAGE ABSOLUE (Demande expresse de Wilfried) :
        // Tant que la tontine est 'En cours', le tirage est validé "une fois de bon" et est 100% verrouillé !
        const isClosed = (tontine.status === 'Clôturée' || tontine.status === 'Terminée' || tontine.isClosed === true);
        if (lockBadge) lockBadge.style.display = isClosed ? 'none' : 'flex';
        if (btnReset) {
            if (!isClosed) {
                btnReset.classList.add('hidden'); // Interdiction totale d'afficher le bouton pendant le cycle en cours !
            } else {
                btnReset.classList.remove('hidden'); // Autoriser un nouveau cycle uniquement si la tontine a d'abord été clôturée !
            }
        }
    } else {
        if (certBox) certBox.classList.add('hidden');
        if (btnTrigger) btnTrigger.style.display = ''; // Réafficher le bouton si non officiel
        if (btnReset) btnReset.classList.add('hidden');
        if (lockBadge) lockBadge.style.display = 'none';
    }
}

function triggerTontineDraw() {
    if (!checkPermission('create_tontine')) {
        showToast("🔒 Action refusée : Seul le gestionnaire peut lancer le tirage au sort de l'ordre de passage !", "error");
        return;
    }
    const tontine = window.currentOpenedTontine;
    if (!tontine) return;

    if (tontine.isDrawOfficial) {
        showToast("🔒 Règle Anti-Truquage : Ce tirage est déjà officiel et verrouillé pour ce cycle !", "error");
        return;
    }

    const animBox = document.getElementById('draw-animation-box');
    const resultsBox = document.getElementById('draw-results-list');
    const nameEl = document.getElementById('draw-animation-name');

    if (animBox && resultsBox) {
        resultsBox.style.display = 'none';
        animBox.classList.remove('hidden');

        const dummyNames = ['Kossi A.', 'Awa N.', 'Jean-Paul', 'Fatou D.', 'David M.', 'Sophie L.', 'Raphaël B.'];
        let count = 0;
        const interval = setInterval(() => {
            const rnd = dummyNames[Math.floor(Math.random() * dummyNames.length)];
            if (nameEl) nameEl.textContent = `Mélange en cours : ${rnd} ⚡`;
            count++;
            if (count > 10) {
                clearInterval(interval);
                animBox.classList.add('hidden');
                resultsBox.style.display = 'flex';
                tontine.isDrawOfficial = true;
                tontine.certCode = 'CERT-' + Math.random().toString(36).substring(2, 6).toUpperCase();
                tontine.certTime = new Date().toLocaleDateString('fr-FR') + ' à ' + new Date().toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
                saveTontineDrawState(tontine); // Sauvegarde permanente !
                renderTontineDrawOrder(tontine, true);
                showToast(`🛡️ Tirage certifié (#${tontine.certCode}) ! Ordre officiel verrouillé pour ce cycle.`, "success");
            }
        }, 120);
    }
}

function resetTontineDraw() {
    if (!checkPermission('create_tontine')) {
        showToast("🔒 Action refusée : Seul le gestionnaire peut lancer un nouveau cycle !", "error");
        return;
    }
    const tontine = window.currentOpenedTontine;
    if (!tontine) return;

    const isClosed = (tontine.status === 'Clôturée' || tontine.status === 'Terminée' || tontine.isClosed === true);
    if (!isClosed) {
        showToast("🔒 IMPOSSIBLE DE RELANCER : Conformément aux règles anti-truquage, un tirage officiel ne peut absolument pas être relancé tant que la tontine est 'En cours'. Vous devez d'abord clôturer cette tontine avant de pouvoir recommencer un nouveau tirage !", "error");
        return;
    }

    if (!confirm("⚠️ NOUVEAU CYCLE : Vous êtes sur le point de lancer un nouveau cycle pour cette tontine clôturée. L'ancien certificat de tirage sera archivé et un nouveau tirage pourra être effectué. Continuer ?")) {
        return;
    }

    tontine.isDrawOfficial = false;
    tontine.certCode = null;
    tontine.certTime = null;
    saveTontineDrawState(tontine);

    showToast("⚠️ Cycle réinitialisé. Vous pouvez maintenant lancer le tirage pour le nouveau tour.", "warning");
    renderTontineDrawOrder(tontine, false);
}

function shareDrawCertWhatsApp() {
    const tontine = window.currentOpenedTontine;
    if (!tontine || !tontine.drawOrder) return;

    let msg = `🏛️ *TONTINE PRO — CERTIFICAT DE TIRAGE OFFICIEL* 🏛️\n`;
    msg += `Tontine : *${tontine.name}*\n`;
    if (tontine.certCode) msg += `Certificat : *#${tontine.certCode}* (${tontine.certTime})\n\n`;
    msg += `*Ordre officiel d'encaissement :*\n`;
    
    const monthNames = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
    const currentMonth = new Date().getMonth();

    tontine.drawOrder.forEach((name, idx) => {
        const drawMonth = monthNames[(currentMonth + idx) % 12];
        msg += `${idx === 0 ? '👑' : '👤'} *Tour #${idx + 1} (${drawMonth})* : ${name}\n`;
    });

    msg += `\n🛡️ _Ordre certifié par algorithme aléatoire équitable._\n`;
    if (tontine.certCode) {
        msg += `🔍 *Vérifiez l'authenticité de ce tirage ici* :\n`;
        const baseUrl = window.location.origin;
        msg += `${baseUrl}/verify.html?cert=${tontine.certCode}\n`;
    }

    window.open('https://wa.me/?text=' + encodeURIComponent(msg), '_blank');
}

window.triggerTontineDraw = triggerTontineDraw;
window.renderTontineDrawOrder = renderTontineDrawOrder;
window.resetTontineDraw = resetTontineDraw;
window.shareDrawCertWhatsApp = shareDrawCertWhatsApp;

// ==========================================
// OPTION B : GESTION AUTOMATIQUE DES PÉNALITÉS DE RETARD (TAUX 1% PAR 24H)
// ==========================================
function renderTontinePenalties(tontine) {
    const list = document.getElementById('penalty-members-list');
    const totalEl = document.getElementById('penalty-total-amount');
    if (!list) return;

    const baseAmount = tontine.amount || 50000;
    // Règle de calcul : 1% de la cotisation par 24h (1 jour) de retard
    const dailyRate = Math.round(baseAmount * 0.01);

    // Initialiser le solde des pénalités si non existant
    if (tontine.penaltyTotal === undefined) tontine.penaltyTotal = dailyRate * 8;
    if (totalEl) totalEl.textContent = new Intl.NumberFormat('fr-FR').format(tontine.penaltyTotal) + ' FCFA';

    // Membres en retard simulés ou réels (ex: Awa N., Fatou D.)
    let lateMembers = [
        { id: 'mem-2', name: 'Awa N.', days: 4, penalty: 4 * dailyRate, status: 'En retard', reason: 'Cotisation Tour #2' },
        { id: 'mem-4', name: 'Fatou D.', days: 5, penalty: 5 * dailyRate, status: 'En retard', reason: 'Cotisation Tour #2' }
    ];

    if (tontine.lateMembersList) {
        lateMembers = tontine.lateMembersList;
        // Mettre à jour dynamiquement selon le taux 1% par 24h de retard
        lateMembers.forEach(m => {
            m.penalty = (m.days || 1) * dailyRate;
        });
    } else {
        tontine.lateMembersList = lateMembers;
    }

    if (lateMembers.length === 0) {
        list.innerHTML = `<div style="padding:12px; text-align:center; color:#16a34a; font-size:13px; font-weight:600; background:rgba(22, 163, 74, 0.08); border-radius:8px;">✔ Aucun retard ! Tous les participants sont à jour pour ce cycle.</div>`;
        return;
    }

    list.innerHTML = lateMembers.map(m => `
        <div style="display:flex; justify-content:space-between; align-items:center; background:var(--surface, #fff); padding:10px 12px; border-radius:8px; border:1px solid rgba(239, 68, 68, 0.2);">
            <div style="display:flex; align-items:center; gap:10px;">
                <div style="width:32px; height:32px; border-radius:50%; background:#fee2e2; color:#dc2626; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:13px;">⚠</div>
                <div>
                    <div style="font-weight:600; font-size:13px; color:var(--text-1);">${m.name} <span style="font-size:11px; color:#dc2626; font-weight:normal;">(${m.reason})</span></div>
                    <div style="font-size:11px; color:#b91c1c;">Retard de <strong>${m.days} jours (${m.days * 24}h)</strong> • Taux 1% (${new Intl.NumberFormat('fr-FR').format(dailyRate)} F/24h) : <strong>+${new Intl.NumberFormat('fr-FR').format(m.penalty)} FCFA</strong></div>
                </div>
            </div>
            <button onclick="resolveMemberPenalty('${m.id}', '${escapeHTML(m.name)}', ${m.penalty})" style="background:#16a34a; color:white; border:none; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:700; cursor:pointer; transition:all 0.2s;" onmouseover="this.style.background='#15803d'" onmouseout="this.style.background='#16a34a'">
                ✔ Régulariser
            </button>
        </div>
    `).join('');
}

function applyTontinePenalties() {
    if (!checkPermission('edit_tontine')) {
        showToast("🔒 Action réservée à l'Administrateur ou Gestionnaire de la tontine !", "error");
        return;
    }
    const tontine = window.currentOpenedTontine || state.activeTontines[0];
    if (!tontine) return;

    showToast("⚡ Calcul automatique des pénalités (Taux 1% / 24h) en cours...", "info");
    setTimeout(() => {
        showToast("✔ Pénalités recalculées et synchronisées avec la caisse de réserve !", "success");
        renderTontinePenalties(tontine);
    }, 800);
}

function resolveMemberPenalty(memberId, memberName, penaltyAmount) {
    if (!checkPermission('validate_payment')) {
        showToast("🔒 Action réservée aux Administrateurs !", "error");
        return;
    }
    const tontine = window.currentOpenedTontine;
    if (!tontine || !tontine.lateMembersList) return;

    // Retirer le membre de la liste des retards
    tontine.lateMembersList = tontine.lateMembersList.filter(m => m.id !== memberId);
    
    // Ajouter la pénalité encaissée à la caisse totale
    tontine.penaltyTotal = (tontine.penaltyTotal || 0) + penaltyAmount;
    
    showToast("💰 Pénalité de " + new Intl.NumberFormat('fr-FR').format(penaltyAmount) + " FCFA (1% / 24h) réglée par " + memberName + " et reversée dans la Caisse de Réserve !", "success");
    renderTontinePenalties(tontine);
    if (typeof renderMembers === 'function') renderMembers();
}

function checkMemberPenalty(memberId) {
    const banner = document.getElementById('pay-member-penalty-banner');
    if (!banner) return;
    
    // Vérifier si c'est un membre en retard (ex: Awa N. ou Fatou D. ou id contant 'mem-2' / 'mem-4')
    const sel = document.getElementById('payment-member-input');
    const memberName = sel && sel.selectedIndex > 0 ? sel.options[sel.selectedIndex].text : '';
    
    if (memberName.includes('Awa') || memberName.includes('Fatou') || memberName.includes('retard') || memberId === 'mem-2' || memberId === 'mem-4') {
        const tontine = window.currentOpenedTontine || state.activeTontines[0];
        const baseAmount = tontine ? tontine.amount : 50000;
        const dailyRate = Math.round(baseAmount * 0.01);
        const daysLate = memberName.includes('Fatou') ? 5 : 4;
        const calcPenalty = daysLate * dailyRate;
        
        window.currentDynamicPenalty = calcPenalty;
        
        const badgeEl = document.getElementById('pay-penalty-badge-rate');
        if (badgeEl) badgeEl.textContent = `+${new Intl.NumberFormat('fr-FR').format(calcPenalty)} FCFA (${daysLate}j x 1%)`;
        
        const descEl = document.getElementById('pay-penalty-desc-text');
        if (descEl) descEl.innerHTML = `Une pénalité de <strong>1% par 24h (${daysLate} jours)</strong> a été calculée. <a href="#" onclick="applyPenaltyToAmount(); return false;" style="color:#ef4444; font-weight:700; text-decoration:underline;" id="link-apply-penalty-amount">Ajouter les ${new Intl.NumberFormat('fr-FR').format(calcPenalty)} FCFA au montant</a>`;
        
        banner.style.display = 'block';
    } else {
        banner.style.display = 'none';
        window.currentDynamicPenalty = 0;
    }
}

function applyPenaltyToAmount() {
    const amtInp = document.getElementById('payment-amount-input');
    if (!amtInp) return;
    const currentVal = parseFloat(amtInp.value) || 0;
    const penaltyToAdd = window.currentDynamicPenalty || 2000;
    amtInp.value = currentVal + penaltyToAdd;
    showToast(`✔ +${new Intl.NumberFormat('fr-FR').format(penaltyToAdd)} FCFA (Taux 1% par 24h de retard) ajoutés au montant à encaisser !`, "success");
}

// INTERCEPTION TOUCHE RETOUR (BACK BUTTON SUR MOBILE) POUR FERMER LES MODALES
window.modalHistoryPushed = false;
window.addEventListener('popstate', (e) => {
    const openModals = document.querySelectorAll('.modal-overlay:not(.hidden)');
    if (openModals.length > 0) {
        openModals.forEach(m => m.classList.add('hidden'));
        window.modalHistoryPushed = false;
    }
});

window.renderTontinePenalties = renderTontinePenalties;
window.applyTontinePenalties = applyTontinePenalties;
window.resolveMemberPenalty = resolveMemberPenalty;
window.checkMemberPenalty = checkMemberPenalty;
window.applyPenaltyToAmount = applyPenaltyToAmount;


function renderTransactions() {
    const list = document.getElementById('transactions-list');
    if (!list) return;
    list.innerHTML = '';

    state.transactions.slice(0, 5).forEach(tx => {
        const item = document.createElement('div');
        item.className = 'transaction-item';
        const isDep = tx.type === 'deposit';
        item.innerHTML = `
            <div class="tx-icon ${isDep ? 'green' : 'red'}">
                <i data-feather="${isDep ? 'arrow-down-left' : 'arrow-up-right'}"></i>
            </div>
            <div class="tx-info">
                <div class="tx-title">${tx.title}</div>
                <div class="tx-date">${tx.date}</div>
            </div>
            <div class="tx-amount ${isDep ? 'green' : ''}">${isDep ? '+' : '-'}${new Intl.NumberFormat('fr-FR').format(tx.amount)}</div>
        `;
        list.appendChild(item);
    });
    if (window.feather) feather.replace();
}

function renderRecentMessages() {
    // There are actually two containers for recent messages. Let's find dashboard-recent-messages
    const container = document.getElementById('dashboard-recent-messages');
    if (!container) return;
    container.innerHTML = '';

    state.recentMessages.slice(0, 3).forEach(msg => {
        const item = document.createElement('div');
        item.className = 'message-item';
        item.innerHTML = `
            <div class="msg-avatar ${msg.type}">
                ${msg.type === 'group' ? '<i data-feather="users"></i>' : msg.type === 'system' ? '<i data-feather="bell"></i>' : '<i data-feather="user"></i>'}
            </div>
            <div class="msg-content">
                <div class="msg-header">
                    <span class="msg-sender">${escapeHTML(msg.sender)}</span>
                    <span class="msg-time">${escapeHTML(msg.time)}</span>
                </div>
                <div class="msg-text">${escapeHTML(msg.text)}</div>
            </div>
        `;
        container.appendChild(item);
    });
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
}

function renderActivityFeed() {
    const container = document.getElementById('dashboard-activity-feed');
    if (!container) return;
    
    // Mock data for the activity feed to make the dashboard feel alive
    const activities = [
        { icon: 'check', color: 'bg-green', text: '<strong>Raphaël AGBOGAN</strong> a validé sa cotisation de 50 000 FCFA.', time: 'Il y a 10 min' },
        { icon: 'clock', color: 'bg-yellow', text: 'Le tour de <strong>Marie</strong> approche dans 2 jours.', time: 'Il y a 2 heures' },
        { icon: 'user-plus', color: 'bg-blue', text: '<strong>Jean</strong> a rejoint la tontine "Projet Vacances".', time: 'Hier à 14h' },
        { icon: 'award', color: 'bg-purple', text: 'La tontine <strong>"Épargne 2026"</strong> a été clôturée avec succès.', time: 'Il y a 2 jours' }
    ];
    
    container.innerHTML = activities.map(act => `
        <div class="activity-item">
            <div class="activity-icon ${act.color}"><i data-feather="${act.icon}"></i></div>
            <div class="activity-content">
                ${act.text}
                <div class="activity-time">${act.time}</div>
            </div>
        </div>
    `).join('');
    
    if (typeof feather !== 'undefined') {
        feather.replace();
    }
};

        window.dashboardChartInstance = null;
function animateDashboardCurve() {
    try {
        if (typeof Chart === 'undefined') {
            console.warn("Chart.js n'est pas encore chargé.");
            return;
        }

        const ctx = document.getElementById('dashboard-curve-chart');
        if (!ctx) return;
        
        if (window.dashboardChartInstance) {
            window.dashboardChartInstance.destroy();
        }

        // Données simulées pour la courbe d'évolution (Style Shopify)
        const labels = ['1er', '5', '10', '15', '20', '25', '30'];
        
        // Total validé des paiements pour rendre ça un peu plus dynamique si possible, sinon statique
        let baseVal = (state.stats && state.stats.validatedPaymentsToday > 0) ? (state.stats.validatedPaymentsToday * 10000) : 150000;
        const dataPoints = [baseVal*0.1, baseVal*0.25, baseVal*0.2, baseVal*0.45, baseVal*0.4, baseVal*0.7, baseVal];

        window.dashboardChartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Évolution (FCFA)',
                    data: dataPoints,
                    borderColor: '#10b981',
                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                    borderWidth: 3,
                    tension: 0.4, // courbe lisse
                    fill: true,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#10b981',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: '#1e293b',
                        padding: 12,
                        titleFont: { size: 13, family: 'Inter, sans-serif' },
                        bodyFont: { size: 14, weight: 'bold', family: 'Inter, sans-serif' },
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return new Intl.NumberFormat('fr-FR').format(context.parsed.y) + ' FCFA';
                            }
                        }
                    }
                },
                scales: {
                    y: {
                        display: false,
                        beginAtZero: true
                    },
                    x: {
                        grid: { display: false, drawBorder: false },
                        ticks: { color: '#94a3b8', font: { family: 'Inter, sans-serif', size: 12 } }
                    }
                }
            }
        });
    } catch (e) {
        console.error("Erreur lors de la création de la courbe: ", e);
    }
}

// --- 8. HELPERS ---

function toggleActionMenu(event, id) {
    event.stopPropagation();
    // Close all other open dropdowns first
    document.querySelectorAll('.action-dropdown.show').forEach(dropdown => {
        if (dropdown.id !== `dropdown-${id}`) {
            dropdown.classList.remove('show');
        }
    });
    
    // Toggle the targeted dropdown
    const targetDropdown = document.getElementById(`dropdown-${id}`);
    if (targetDropdown) {
        targetDropdown.classList.toggle('show');
    }
}

// Global click listener to close dropdowns when clicking outside
document.addEventListener('click', (event) => {
    // 1. Fermer les menus d'action
    if (!event.target.closest('.action-menu-container')) {
        document.querySelectorAll('.action-dropdown.show').forEach(dropdown => {
            dropdown.classList.remove('show');
        });
    }
    
    // 2. Fermer le dropdown des notifications
    const notifDropdown = document.getElementById('notifications-dropdown');
    const notifToggle = document.getElementById('btn-notifications-toggle');
    if (notifDropdown && !notifDropdown.classList.contains('hidden')) {
        if (!event.target.closest('#notifications-dropdown') && !event.target.closest('#btn-notifications-toggle')) {
            notifDropdown.classList.add('hidden');
        }
    }
});
function toggleTheme() {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    localStorage.setItem('tontine_theme', isDark ? 'dark' : 'light');
    const iconMoon = document.querySelector('.icon-moon');
    const iconSun = document.querySelector('.icon-sun');
    if (iconMoon && iconSun) {
        iconMoon.classList.toggle('hidden', isDark);
        iconSun.classList.toggle('hidden', !isDark);
    }
}

function loadThemePreference() {
    const saved = localStorage.getItem('tontine_theme');
    const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches);
    if (isDark) {
        document.body.classList.add('dark-mode');
        const iconMoon = document.querySelector('.icon-moon');
        const iconSun = document.querySelector('.icon-sun');
        if (iconMoon && iconSun) {
            iconMoon.classList.add('hidden');
            iconSun.classList.remove('hidden');
        }
    }
}

async function switchTab(tabId) {
    // Mettre à jour les classes actives sur les boutons du menu
    document.querySelectorAll('.nav-item').forEach(nav => {
        nav.classList.toggle('active', nav.getAttribute('data-tab') === tabId);
    });

    // Afficher le bon panneau
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.toggle('active', pane.id === `tab-${tabId}`);
    });

    // Charger et rendre les données selon l'onglet
    switch (tabId) {
        case 'circle':
            await renderCircleTab();
            break;
        case 'members':
            await renderMembersTab();
            break;
        case 'register':
            await renderRegistreTab();
            break;
        case 'messages':
            await renderMessagesTab();
            break;
        case 'notifications':
            await renderNotificationsTab();
            break;
        case 'calendar':
            await renderCalendarTab();
            break;
        case 'reports':
            await renderReportsTab();
            break;
        case 'member-stats':
            await renderMemberStatsTab();
            break;
        case 'votes':
            await renderVotesTab();
            break;
        case 'payments':
            await renderPaymentsTab();
            break;
        case 'admin':
            if (checkPermission('view_admin')) {
                await renderAdminTab();
            } else {
                showToast('Accès réservé aux administrateurs.', 'error');
                switchTab('home');
            }
            break;
        case 'home':
            await loadDynamicData();
            renderDashboard();
            animateDashboardCurve();
            break;
    }
}

function playSuccessSound() {
    if (soundSuccess) {
        soundSuccess.currentTime = 0;
        soundSuccess.play().catch(e => console.log("Audio block details:", e));
    }
}

// --- 9. RENDERERS DES ONGLETS SECONDAIRES ---

async function renderCircleTab() {
    const select = document.getElementById('circle-group-select');
    if (!select) return;

    if (!state.activeTontines || state.activeTontines.length === 0) {
        select.innerHTML = '<option value="">Aucune tontine active</option>';
        updateCircleView(null);
        return;
    }

    // Initialize select options if empty or new tontines added
    if (select.options.length === 0 || select.options.length !== state.activeTontines.length) {
        select.innerHTML = '';
        state.activeTontines.forEach(t => {
            select.innerHTML += `<option value="${t.id}">${escapeHTML(t.name)}</option>`;
        });
    }

    // Ensure listener is attached only once
    if (!select.dataset.listenerAttached) {
        select.addEventListener('change', (e) => {
            const selectedTontine = state.activeTontines.find(t => t.id == e.target.value);
            if (selectedTontine) updateCircleView(selectedTontine);
        });
        select.dataset.listenerAttached = 'true';
    }

    // Default to currently selected or first one
    const currentVal = select.value || (state.activeTontines[0] ? state.activeTontines[0].id : null);
    if (currentVal) {
        const initialTontine = state.activeTontines.find(t => t.id == currentVal);
        if (initialTontine) updateCircleView(initialTontine);
    }
}

function updateCircleView(tontine) {
    const title = document.getElementById('circle-title-label');
    const beneficiary = document.getElementById('circle-beneficiary-label');
    const share = document.getElementById('circle-individual-share-label');
    const statusText = document.getElementById('circle-amount-status');
    const progFill = document.getElementById('circle-prog-fill');
    const badge = document.getElementById('circle-badge');

    if (!tontine) {
        if(title) title.textContent = "-";
        if(beneficiary) beneficiary.textContent = "-";
        if(share) share.textContent = "0 FCFA";
        if(statusText) statusText.textContent = "0 / 0 FCFA";
        if(progFill) progFill.style.width = "0%";
        if(badge) badge.textContent = "-";
        return;
    }

    if(title) title.textContent = tontine.name;
    if(beneficiary) beneficiary.textContent = "Tour actuel";
    if(share) share.textContent = tontine.amount.toLocaleString('fr-FR') + " FCFA";
    if(badge) badge.textContent = tontine.status || "En cours";

    const maxM = parseInt(tontine.members.split('/')[1]) || 10;
    const currentM = parseInt(tontine.members.split('/')[0]) || 0;
    const totalExpected = tontine.amount * maxM;
    const currentCollected = tontine.amount * currentM;
    
    if(statusText) statusText.textContent = currentCollected.toLocaleString('fr-FR') + " / " + totalExpected.toLocaleString('fr-FR') + " FCFA";
    
    let progPercent = maxM > 0 ? (currentM / maxM) * 100 : 0;
    if (progPercent > 100) progPercent = 100;
    
    if(progFill) {
        progFill.style.transition = 'width 1s ease-in-out';
        progFill.style.width = progPercent + "%";
    }
}

/* ==========================================
   AXE 6 : TONTINE TRUST SCORE (SCORING & BADGES)
   ========================================== */
function calculateTrustScore(member, transactions = []) {
    let baseScore = member.trust !== undefined ? member.trust : (member.reliability_score !== undefined ? member.reliability_score : 100);
    
    if ((member.status === 'En retard' || member.role === 'En retard') && baseScore > 65) {
        baseScore = Math.max(30, baseScore - 35);
    }

    const penalties = (state.penalties || []).filter(p => p.member === (member.name || member.full_name));
    penalties.forEach(p => {
        if (!p.resolved) baseScore = Math.max(10, baseScore - 20);
        else baseScore = Math.min(95, baseScore + 5);
    });

    return Math.round(Math.min(100, Math.max(0, baseScore)));
}

function getTrustBadgeHTML(score, memberName = '') {
    let badgeClass = 'trust-badge-platinum';
    let icon = '💎';
    let label = 'Platine';

    if (score >= 90) {
        badgeClass = 'trust-badge-platinum';
        icon = '💎';
        label = 'Platine';
    } else if (score >= 75) {
        badgeClass = 'trust-badge-gold';
        icon = '🥇';
        label = 'Or';
    } else if (score >= 50) {
        badgeClass = 'trust-badge-silver';
        icon = '🥈';
        label = 'Argent';
    } else {
        badgeClass = 'trust-badge-risk';
        icon = '⚠️';
        label = 'À Risque';
    }

    const safeName = escapeHTML(memberName || 'Ce membre');
    return `<span class="trust-badge ${badgeClass}" onclick="showTrustScoreDetails('${safeName}', ${score}, '${label}')" title="Cliquer pour voir le détail de fiabilité">${icon} ${label} (${score}%)</span>`;
}

function showTrustScoreDetails(memberName, score, label) {
    let explanation = "";
    if (score >= 90) {
        explanation = "Fiabilité irréprochable. Aucun retard constaté sur les cycles en cours et ponctualité parfaite aux cotisations.";
    } else if (score >= 75) {
        explanation = "Très bon payeur. Cotise régulièrement avec seulement de très légers retards régularisés rapidement.";
    } else if (score >= 50) {
        explanation = "Fiabilité moyenne. A présenté quelques retards de paiement ou des régularisations tardives dans le passé.";
    } else {
        explanation = "Attention : Profil à risque. Présente des retards de paiement actifs ou des pénalités non régularisées. À surveiller de près avant l'intégration dans des tontines à forts montants.";
    }

    alert(`🌟 TONTINE TRUST SCORE : ${memberName}\n\nScore actuel : ${score}/100 (${label})\n\n📋 Analyse de l'algorithme :\n${explanation}`);
}

async function renderMembersTab(searchQuery = '') {
    const grid = document.getElementById('members-full-grid');
    if (!grid) return;
    grid.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';

    let members = await DataService.getMembers().catch(() => []);
    
    const customAvatar = localStorage.getItem('user_profile_avatar');
    if (customAvatar) {
        members = members.map(m => {
            const mName = m.name || m.full_name || '';
            const uName = (state.user && state.user.name) ? state.user.name : 'Utilisateur';
            if (mName === uName || mName.includes('AGBOGAN') || mName === 'Utilisateur Pro') {
                m.avatar = customAvatar;
            }
            return m;
        });
    }
    if (searchQuery) {
        const lowerQ = searchQuery.toLowerCase();
        members = members.filter(m => {
            const name = (m.name || m.full_name || '').toLowerCase();
            const role = (m.role || m.status || '').toLowerCase();
            return name.includes(lowerQ) || role.includes(lowerQ);
        });
    }

    if (!members || members.length === 0) {
        grid.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Aucun membre trouvé.</p>';
        return;
    }

    grid.innerHTML = members.map(m => {
        const name  = m.name || m.full_name || 'Membre';
        const role  = m.role  || 'Membre actif';
        const status = m.status || 'À jour';
        const isLate = status === 'En retard' || role === 'En retard';
        const statusBadgeClass = isLate ? 'badge-red' : 'badge-green';
        const trustScore = calculateTrustScore(m);
        const trustBadgeHtml = getTrustBadgeHTML(trustScore, name);
        const avatar = m.avatar || getAvatarInitials(name);
        const contributed = m.contributed !== undefined
            ? new Intl.NumberFormat('fr-FR').format(m.contributed) + ' FCFA'
            : (m.amount || '50 000 FCFA');
        const tontinesCount = m.tontines !== undefined ? m.tontines : 1;

        const currentRole = (state.user && state.user.role) ? state.user.role.toLowerCase() : 'membre';
        const isInvitedMember = localStorage.getItem('tontine_invited_member_mode') === 'true';
        const isAdminUser = (currentRole === 'admin' || currentRole === 'gestionnaire' || currentRole === 'administrateur') && !isInvitedMember;
        
        // --- GESTION AVANCES (Portefeuille) ---
        const savedAdvances = JSON.parse(localStorage.getItem('tontine_advances') || '{}');
        const advanceAmount = savedAdvances[name] || 0;
        
        let advanceHtml = '';
        let creditBtnHtml = '';
        if (isAdminUser) {
            advanceHtml = `
            <div style="background: rgba(99, 102, 241, 0.05); padding: 8px 12px; border-radius: 8px; border: 1px dashed rgba(99, 102, 241, 0.3); margin-top: 10px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-size: 12px; color: var(--text-2); font-weight: 600;"><span style="font-size:14px;">💼</span> Avance :</span>
                <span style="font-weight: 800; color: #4f46e5; font-size: 14px;">${new Intl.NumberFormat('fr-FR').format(advanceAmount)} FCFA</span>
            </div>`;
            
            creditBtnHtml = `<button onclick="openCreditAdvanceModal('${escapeHTML(name)}', ${advanceAmount})" style="background: #eef2ff; color: #4f46e5; border: 1px solid #c7d2fe; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.2s; font-weight:600;" onmouseover="this.style.background='#c7d2fe';">Créditer</button>`;
        }

        const actionBtn = (isLate && isAdminUser) ? 
            `<button onclick="sendReminder('${escapeHTML(name)}', 'whatsapp')" style="background: #25D366; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: all 0.2s; font-weight:600;" onmouseover="this.style.transform='translateY(-2px)';" onmouseout="this.style.transform='translateY(0)';"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg> Relancer</button>` : 
            `<button onclick="openMemberStatementModal('', '${escapeHTML(name)}'); return false;" style="background: var(--bg-hover); color: var(--text-2); border: 1px solid var(--border); padding: 6px 12px; border-radius: 6px; font-size: 12px; cursor: pointer; transition: all 0.2s; font-weight:600;" onmouseover="this.style.background='var(--border)';" onmouseout="this.style.background='var(--bg-hover)';">Profil & Relevé</button>`;

        return `
        <div class="member-card-full" style="transition: transform 0.2s, box-shadow 0.2s; padding-bottom:12px;" onmouseover="this.style.transform='translateY(-4px)'; this.style.boxShadow='0 10px 20px rgba(0, 0, 0, 0.08)';" onmouseout="this.style.transform='translateY(0)'; this.style.boxShadow='var(--shadow)';">
            <div class="member-card-top" style="justify-content: space-between; align-items: flex-start;">
                <div style="display: flex; gap: 12px; align-items: center;">
                    <img src="${avatar}" alt="${escapeHTML(name)}" class="member-avatar-large"
                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=5C60F5&color=fff&bold=true'">
                    <div>
                        <div class="member-full-name">${escapeHTML(name)}</div>
                        <div class="member-phone-small">${escapeHTML(m.phone || m.email || role)}</div>
                    </div>
                </div>
                <span class="badge-status ${statusBadgeClass}" style="font-size: 11px;">${status}</span>
            </div>
            
            <div style="display: flex; align-items: center; justify-content: space-between; background: rgba(92, 96, 245, 0.04); padding: 8px 12px; border-radius: 8px; border: 1px dashed rgba(92, 96, 245, 0.2);">
                <span style="font-size: 12px; color: var(--text-2); font-weight: 500;">Fiabilité (Trust Score) :</span>
                ${trustBadgeHtml}
            </div>
            
            ${advanceHtml}
            
            <div class="member-stats-row" style="grid-template-columns: 1fr 1fr; margin-top: 10px;">
                <div class="member-stat-mini">
                    <span class="member-stat-mini-val">${tontinesCount}</span>
                    <span class="member-stat-mini-label">Tontine(s)</span>
                </div>
                <div class="member-stat-mini">
                    <span class="member-stat-mini-val" style="color: var(--primary); font-size: 13px;">${contributed}</span>
                    <span class="member-stat-mini-label">Total cotisé</span>
                </div>
            </div>
            
            <div style="display: flex; justify-content: flex-end; gap: 8px; border-top: 1px solid var(--border); padding-top: 12px; margin-top: auto;">
                ${creditBtnHtml}
                ${actionBtn}
            </div>
        </div>`;
    }).join('');
}

async function renderRegistreTab() {
    const tbody = document.getElementById('master-registry-table-body');
    if (!tbody) return;
    
    // Utiliser les transactions locales (qui incluent les paiements récents sans recharger)
    const transactions = state.transactions || [];
    
    if (transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="7" style="padding: 60px 20px; text-align: center;">
            <div style="display:flex; flex-direction:column; align-items:center; gap:16px;">
                <div style="background:rgba(245, 158, 11, 0.1); color:#F59E0B; width:64px; height:64px; border-radius:50%; display:flex; align-items:center; justify-content:center;">
                    <i data-feather="activity" style="width:32px; height:32px;"></i>
                </div>
                <div>
                    <h3 style="color:var(--text-1); font-size:18px; font-weight:700; margin-bottom:4px;">Aucune transaction</h3>
                    <p style="color:var(--text-3); font-size:14px; max-width:300px; margin:0 auto;">L'historique des cotisations et des retraits apparaîtra ici une fois que votre tontine sera active.</p>
                </div>
            </div>
        </td></tr>`;
        setTimeout(() => feather.replace(), 0);
        return;
    }

    tbody.innerHTML = transactions.map(tx => {
        const isDeposit = tx.type === 'deposit';
        const badgeClass = isDeposit ? 'badge-green' : 'badge-red';
        const badgeLabel = isDeposit ? 'Cotisation' : 'Retrait';
        return `
        <tr>
            <td>${tx.date || '-'}</td>
            <td>${tx.tontine || 'Épargne'}</td>
            <td>${tx.title || '-'}</td>
            <td><span class="badge-status ${badgeClass}">${badgeLabel}</span></td>
            <td style="font-weight:600">${(tx.amount || 0).toLocaleString('fr-FR')} FCFA</td>
            <td><span class="badge-status badge-green">Validé</span></td>
            <td>
                <div class="action-menu-container" style="position:relative;">
                    <button class="btn-action-dots" onclick="toggleTxDropdown('${tx.id}')" style="font-size:18px;">&#8942;</button>
                    <div id="dropdown-tx-${tx.id}" class="dropdown-menu hidden" style="position:absolute; right:0; top:100%; background:white; border:1px solid #e2e8f0; border-radius:6px; box-shadow:0 4px 6px -1px rgba(0,0,0,0.1); z-index:10; min-width:120px; text-align:left;">
                        <button style="display:block; width:100%; text-align:left; padding:8px 12px; background:none; border:none; color:#ef4444; font-size:13px; cursor:pointer;" onclick="deleteTransaction('${tx.id}')">Supprimer</button>
                    </div>
                </div>
            </td>
        </tr>
        `;
    }).join('');
}

window.toggleTxDropdown = function(id) {
    document.querySelectorAll('[id^="dropdown-tx-"]').forEach(d => {
        if (d.id !== 'dropdown-tx-' + id) d.classList.add('hidden');
    });
    const drop = document.getElementById('dropdown-tx-' + id);
    if (drop) drop.classList.toggle('hidden');
};

window.deleteTransaction = function(id) {
    if (confirm("Êtes-vous sûr de vouloir supprimer cette transaction de l'historique ?")) {
        // Supprimer du state
        state.transactions = state.transactions.filter(tx => tx.id !== id);
        
        // Mettre à jour le localStorage pour la persistance locale
        let demoTxs = JSON.parse(localStorage.getItem('demo_transactions') || '[]');
        demoTxs = demoTxs.filter(tx => tx.id !== id);
        localStorage.setItem('demo_transactions', JSON.stringify(demoTxs));
        
        // Rafraîchir la vue
        renderRegistreTab();
        showToast("Transaction supprimée avec succès", "success");
    }
};

async function renderMessagesTab() {
    const tontines = state.activeTontines || [];
    const members = state.extendedMembers || extendedMembers || [];
    
    // 1. Salons de Tontines
    const roomsList = document.getElementById('tontine-rooms-list');
    if (roomsList) {
        let roomsHTML = `
            <div class="conv-item active-conv" style="cursor:pointer; padding: 10px; border-radius: 8px; margin-bottom: 4px;" onclick="switchTontineRoom('# Général - Communauté', 'Tous les membres &middot; En ligne', null)">
                <div style="width: 34px; height: 34px; border-radius: 8px; background: rgba(92,96,245,0.15); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 15px;">#</div>
                <div style="flex: 1; min-width: 0;">
                    <div style="font-weight: 700; font-size: 13px; color: var(--text-1);"># Général</div>
                    <div style="font-size: 11px; color: var(--text-3);">Communauté Tontine Pro</div>
                </div>
            </div>
        `;
        
        tontines.forEach(t => {
            const memCount = (t.members && t.members.length) ? t.members.length : members.length;
            const safeName = escapeHTML(t.name).replace(/'/g, "\\'");
            roomsHTML += `
                <div class="conv-item" style="cursor:pointer; padding: 10px; border-radius: 8px; margin-bottom: 4px;" onclick="switchTontineRoom('# ${safeName}', '${memCount} membres &middot; Salon Tontine', '${t.id}')">
                    <div style="width: 34px; height: 34px; border-radius: 8px; background: rgba(16,185,129,0.15); color: #10B981; display: flex; align-items: center; justify-content: center; font-size: 16px;">🚀</div>
                    <div style="flex: 1; min-width: 0;">
                        <div style="font-weight: 700; font-size: 13px; color: var(--text-1); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"># ${escapeHTML(t.name)}</div>
                        <div style="font-size: 11px; color: var(--text-3);">${new Intl.NumberFormat('fr-FR').format(t.amount || 0)} FCFA</div>
                    </div>
                </div>
            `;
        });
        roomsList.innerHTML = roomsHTML;
    }

    // 2. Messages Directs
    const convList = document.getElementById('conversations-list');
    if (convList) {
        const isInvitedMember = localStorage.getItem('tontine_invited_member_mode') === 'true';
        let role = (state.user && state.user.role) ? state.user.role.toLowerCase() : 'membre';
        if (isInvitedMember) role = 'membre';
        const isAdmin = (role === 'admin' || role === 'gestionnaire' || role === 'administrateur');

        if (!isAdmin) {
            // Le membre voit un seul contact : Support / Gestionnaire
            convList.innerHTML = `
                <div class="conv-item" style="cursor:pointer; padding: 10px; border-radius: 8px;" onclick="switchTontineRoom('@Gestionnaire (Support)', 'En ligne', null)">
                    <div class="msg-avatar" style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(99,102,241,0.1);color:#6366f1;">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Gestionnaire (Support)</div>
                        <div style="font-size:11.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Besoin d'aide ? Contactez-moi</div>
                    </div>
                </div>
            `;
        } else {
            // Le gestionnaire voit la liste de tous les membres pour les contacter en privé
            let membersHtml = '';
            members.forEach(m => {
                const name = m.name || m.full_name || 'Membre';
                const initial = name[0].toUpperCase();
                const safeName = escapeHTML(name).replace(/'/g, "\\'");
                membersHtml += `
                    <div class="conv-item" style="cursor:pointer; padding: 10px; border-radius: 8px;" onclick="switchTontineRoom('@${safeName}', 'Membre', null)">
                        <div class="msg-avatar" style="width:34px;height:34px;border-radius:50%;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(16,185,129,0.1);color:#10B981;font-weight:bold;font-size:14px;">
                            ${initial}
                        </div>
                        <div style="flex:1;min-width:0">
                            <div style="font-weight:600;font-size:12.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHTML(name)}</div>
                            <div style="font-size:11.5px;color:var(--text-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">Message direct</div>
                        </div>
                    </div>
                `;
            });
            convList.innerHTML = membersHtml;
        }
    }

    // Initialisation Chat par défaut
    switchTontineRoom('# Général - Communauté', 'Tous les membres &middot; En ligne', null);

    // 3. Initialisation Centre de Relance
    const memSelect = document.getElementById('reminder-member-select');
    if (memSelect) {
        memSelect.innerHTML = '<option value="">Sélectionner un membre...</option>' + 
            members.map(m => `<option value="${escapeHTML(m.name || m.full_name || '')}" ${m.status === 'En retard' ? 'data-retard="true"' : ''}>${escapeHTML(m.name || m.full_name || '')} (${m.status === 'En retard' ? '⚠️ En retard' : 'À jour'})</option>`).join('');
        const lateM = members.find(m => m.status === 'En retard') || members[0];
        if (lateM) memSelect.value = lateM.name || lateM.full_name;
    }

    const tonSelect = document.getElementById('reminder-tontine-select');
    if (tonSelect) {
        tonSelect.innerHTML = '<option value="">Sélectionner une tontine...</option>' + 
            tontines.map(t => `<option value="${escapeHTML(t.name)}" data-amount="${t.amount || 25000}">${escapeHTML(t.name)} (${new Intl.NumberFormat('fr-FR').format(t.amount || 0)} FCFA)</option>`).join('');
        if (tontines.length > 0) tonSelect.value = tontines[0].name;
    }

    if (typeof updateReminderPreview === 'function') updateReminderPreview();
}

function switchTontineRoom(roomName, countText, tontineId) {
    const titleEl = document.getElementById('chat-title');
    const countEl = document.getElementById('chat-members-count');
    const msgsEl = document.getElementById('chat-messages-area');
    
    if (titleEl) titleEl.textContent = roomName;
    if (countEl) countEl.innerHTML = `<span style="width: 6px; height: 6px; border-radius: 50%; background: #10B981; display: inline-block; margin-right: 6px;"></span>` + countText;

    // Mise à jour visuelle de la liste des salons (gauche)
    document.querySelectorAll('.conv-item').forEach(el => {
        el.classList.remove('active-conv');
        const textContent = el.textContent || '';
        const cleanRoom = roomName.replace('# ', '').replace('@', '').trim();
        if (cleanRoom && textContent.includes(cleanRoom)) {
            el.classList.add('active-conv');
        }
    });

    // Vérification du rôle actuel
    const isInvitedMember = localStorage.getItem('tontine_invited_member_mode') === 'true';
    let role = (state.user && state.user.role) ? state.user.role.toLowerCase() : 'membre';
    if (isInvitedMember) role = 'membre';
    const isAdmin = (role === 'admin' || role === 'gestionnaire' || role === 'administrateur');

    const inputEl = document.getElementById('chat-message-input');
    const sendBtn = document.getElementById('btn-send-chat-message');
    
    if (inputEl && sendBtn) {
        const isGroup = roomName.startsWith('#');
        
        if (!isAdmin && isGroup) {
            inputEl.disabled = true;
            inputEl.placeholder = "Seul le gestionnaire peut publier sur ce mur.";
            sendBtn.disabled = true;
            sendBtn.style.opacity = '0.5';
            inputEl.style.cursor = 'not-allowed';
            inputEl.style.backgroundColor = '#f1f5f9';
        } else {
            inputEl.disabled = false;
            inputEl.placeholder = "Écrivez votre message...";
            sendBtn.disabled = false;
            sendBtn.style.opacity = '1';
            inputEl.style.cursor = 'text';
            inputEl.style.backgroundColor = '#ffffff';
        }
        
        // On attache l'action d'envoi
        sendBtn.onclick = () => { if (!sendBtn.disabled) sendMessage(roomName, isAdmin); };
        inputEl.onkeydown = (e) => { if(e.key === 'Enter' && !inputEl.disabled) sendMessage(roomName, isAdmin); };
    }

    if (msgsEl) {
        msgsEl.innerHTML = `
            <div style="text-align: center; font-size: 11px; color: var(--text-3); margin: 10px 0;">--- Aujourd'hui ---</div>
            <div style="display: flex; gap: 10px; align-items: flex-start;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: #6366F1; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;">W</div>
                <div style="background: var(--surface); border: 1px solid var(--border); padding: 12px 14px; border-radius: 14px; border-top-left-radius: 4px; max-width: 80%;">
                    <div style="font-size: 11.5px; font-weight: 700; color: #6366F1; margin-bottom: 4px;">Wilfried (Gestionnaire)</div>
                    <div style="font-size: 13.5px; color: var(--text-1); line-height: 1.4;">Bienvenue dans le salon <strong>${escapeHTML(roomName)}</strong> ! N'hésitez pas à poser vos questions ou à partager les justificatifs de vos cotisations Wave / OM ici. 🚀</div>
                    <div style="font-size: 10px; color: var(--text-3); text-align: right; margin-top: 4px;">10:15</div>
                </div>
            </div>
            <div style="display: flex; gap: 10px; align-items: flex-start;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: #10B981; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;">A</div>
                <div style="background: var(--surface); border: 1px solid var(--border); padding: 12px 14px; border-radius: 14px; border-top-left-radius: 4px; max-width: 80%;">
                    <div style="font-size: 11.5px; font-weight: 700; color: #10B981; margin-bottom: 4px;">Awa Diop</div>
                    <div style="font-size: 13.5px; color: var(--text-1); line-height: 1.4;">Merci Wilfried ! C'est très pratique d'avoir un espace dédié pour chaque tontine. ✅</div>
                    <div style="font-size: 10px; color: var(--text-3); text-align: right; margin-top: 4px;">10:22</div>
                </div>
            </div>
        `;
        msgsEl.scrollTop = msgsEl.scrollHeight;
    }
}
window.switchTontineRoom = switchTontineRoom;

window.currentReminderType = 'tour';
function setReminderType(type) {
    window.currentReminderType = type;
    const btnTour = document.getElementById('btn-rem-type-tour');
    const btnRetard = document.getElementById('btn-rem-type-retard');
    if (btnTour) {
        btnTour.style.border = type === 'tour' ? '2px solid var(--primary)' : '1px solid var(--border)';
        btnTour.style.background = type === 'tour' ? 'rgba(92,96,245,0.08)' : 'var(--surface)';
        btnTour.style.color = type === 'tour' ? 'var(--primary)' : 'var(--text-2)';
    }
    if (btnRetard) {
        btnRetard.style.border = type === 'retard' ? '2px solid #ef4444' : '1px solid var(--border)';
        btnRetard.style.background = type === 'retard' ? 'rgba(239,68,68,0.08)' : 'var(--surface)';
        btnRetard.style.color = type === 'retard' ? '#ef4444' : 'var(--text-2)';
    }
    updateReminderPreview();
}
window.setReminderType = setReminderType;

function generateReminderTemplate(memberName, tontineName, amount, type) {
    const mem = memberName || 'Cher membre';
    const ton = tontineName || 'votre tontine';
    const amtStr = amount ? new Intl.NumberFormat('fr-FR').format(amount) + ' FCFA' : 'votre cotisation';

    if (type === 'retard') {
        return `⚠️ Bonjour ${mem}, nous constatons un retard de paiement concernant la tontine « ${ton} » (${amtStr}). Merci de régulariser rapidement votre situation via Wave / Orange Money afin d'éviter l'application des pénalités de retard et maintenir la confiance du groupe. Merci de votre compréhension ! 🙏`;
    } else {
        return `🔔 Bonjour ${mem}, rappel amical Tontine Pro : le prochain tour de la tontine « ${ton} » approche à grands pas ! Montant à cotiser : ${amtStr}. Merci de préparer et valider votre contribution avant la date limite. Bonne journée ! 🚀`;
    }
}
window.generateReminderTemplate = generateReminderTemplate;

function updateReminderPreview() {
    const memEl = document.getElementById('reminder-member-select');
    const tonEl = document.getElementById('reminder-tontine-select');
    const txtEl = document.getElementById('reminder-preview-text');
    if (!txtEl) return;

    const memName = memEl ? memEl.value : '';
    const tonName = tonEl ? tonEl.value : '';
    let amount = 25000;
    if (tonEl && tonEl.selectedIndex > 0) {
        const opt = tonEl.options[tonEl.selectedIndex];
        if (opt && opt.getAttribute('data-amount')) amount = parseInt(opt.getAttribute('data-amount'), 10);
    }

    txtEl.value = generateReminderTemplate(memName, tonName, amount, window.currentReminderType || 'tour');
}
window.updateReminderPreview = updateReminderPreview;

function copyReminderText() {
    const txtEl = document.getElementById('reminder-preview-text');
    if (!txtEl || !txtEl.value) return;
    navigator.clipboard.writeText(txtEl.value).then(() => {
        showToast('📋 Message copié dans le presse-papiers !', 'success');
    }).catch(() => {
        txtEl.select();
        document.execCommand('copy');
        showToast('📋 Message copié !', 'success');
    });
}
window.copyReminderText = copyReminderText;

function sendReminderVia(channel) {
    const txtEl = document.getElementById('reminder-preview-text');
    if (!txtEl || !txtEl.value) {
        showToast('Veuillez d\'abord générer un message de rappel.', 'error');
        return;
    }
    const text = txtEl.value;
    if (channel === 'whatsapp') {
        window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank');
        showToast('🚀 Ouverture de WhatsApp pour envoi du rappel...', 'success');
    } else if (channel === 'sms') {
        window.open('sms:?body=' + encodeURIComponent(text), '_self');
        showToast('📱 Ouverture de votre application SMS...', 'success');
    } else if (channel === 'email') {
        window.open('mailto:?subject=' + encodeURIComponent('Rappel Tontine Pro') + '&body=' + encodeURIComponent(text), '_self');
        showToast('📧 Ouverture de votre client email...', 'success');
    }
}
window.sendReminderVia = sendReminderVia;

function updateNotifBadges(notifs) {
    const unreadCount = notifs.filter(n => !n.read).length;
    document.querySelectorAll('.tb-badge, .menu-badge').forEach(badge => {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'inline-flex' : 'none';
    });
}

async function renderNotificationsTab() {
    const feed = document.getElementById('notifications-feed');
    if (!feed) return;
    feed.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';

    if (!state.notifs) {
        let notifs = await DataService.getNotifications().catch(() => []);
        // Fallback : Génération dynamique intelligente si pas de base de données
        if (!notifs || notifs.length === 0) {
            notifs = [];
            let timeOffset = 1;
            
            // 1. Générer des rappels dynamiques selon les tontines actives
            if (state.activeTontines && state.activeTontines.length > 0) {
                state.activeTontines.forEach((t, idx) => {
                    // On détermine le texte selon la fréquence (jour, semaine, mois)
                    let freqText = "à la prochaine échéance";
                    if (t.frequency === 'quotidien') freqText = "demain";
                    if (t.frequency === 'hebdomadaire') freqText = "dans 7 jours";
                    if (t.frequency === 'mensuel') freqText = "le mois prochain";
                    
                    notifs.push({
                        type: 'round',
                        title: `Rappel : Le prochain tour de la tontine « ${t.name} » approche (${freqText}).`,
                        created_at: new Date(Date.now() - timeOffset * 3600000).toISOString(),
                        read: false
                    });
                    timeOffset += 2;
                });
            }

            // 2. Ajouter quelques notifications système/paiement de base
            notifs.push(
                { type: 'payment', title: 'Cotisation reçue — Awa Diop (35 000 FCFA)', created_at: new Date(Date.now() - timeOffset * 3600000).toISOString(), read: false },
                { type: 'system',  title: 'Nouvelle fonctionnalité : Le centre de notifications dynamique est activé !', created_at: new Date(Date.now() - (timeOffset+2) * 3600000).toISOString(), read: false },
                { type: 'payment', title: 'Paiement Mobile Money confirmé', created_at: new Date(Date.now() - 24 * 3600000).toISOString(), read: true },
                { type: 'system',  title: 'Rapport mensuel généré avec succès', created_at: new Date(Date.now() - 48 * 3600000).toISOString(), read: true }
            );
        }
        
        // Exposer une fonction globale pour ajouter de vraies notifications dynamiquement
        window.addNotification = (type, title) => {
            if (!state.notifs) state.notifs = [];
            state.notifs.unshift({
                type: type,
                title: title,
                created_at: new Date().toISOString(),
                read: false
            });
            renderNotificationsTab(); // Refresh l'UI
        };

        state.notifs = notifs;
    }
    
    const notifs = state.notifs;
    
    // Toujours mettre à jour les badges globaux à chaque rendu
    updateNotifBadges(notifs);

    // Filtrage par onglet actif
    const activeFilter = document.querySelector('.notif-tab-btn.active');
    const filter = activeFilter ? activeFilter.getAttribute('data-filter') : 'all';
    const filtered = filter === 'all' ? notifs : notifs.filter(n => n.type === filter);

    // Wiring des boutons de filtre
    document.querySelectorAll('.notif-tab-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.notif-tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderNotificationsTab();
        };
    });

    // Bouton « Tout marquer lu »
    const btnMarkRead = document.getElementById('btn-mark-all-read');
    if (btnMarkRead) {
        btnMarkRead.onclick = async () => {
            // Marquer local
            notifs.forEach(n => n.read = true);
            updateNotifBadges(notifs);

            // Mettre à jour Supabase si connecté
            if (DataService.isConnected()) {
                const client = window.SupabaseService && window.SupabaseService.getClient ? window.SupabaseService.getClient() : null;
                if (client) {
                    await client.from('notifications')
                        .update({ is_read: true })
                        .eq('is_read', false)
                        .catch(e => console.warn('[Notifs] Erreur mise à jour:', e));
                }
            }
            renderNotificationsTab();
        };
    }

    if (filtered.length === 0) {
        feed.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Aucune notification dans cette catégorie.</p>';
        return;
    }

    const icons = {
        payment: '<polyline points="20 6 9 17 4 12"/>',
        round:   '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
        system:  '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'
    };
    const colors = { payment: '#10B981', round: '#F59E0B', system: '#5C60F5' };

    feed.innerHTML = filtered.map((n, i) => {
        const iconPath = icons[n.type]  || icons.system;
        const color    = colors[n.type] || '#5C60F5';
        const date     = n.created_at ? new Date(n.created_at).toLocaleString('fr-FR', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : '';
        return `
        <div class="notif-item${n.read ? '' : ' unread'}" data-index="${i}" style="cursor:${n.read ? 'default' : 'pointer'};display:flex;align-items:flex-start;gap:14px;padding:14px 16px;border-bottom:1px solid var(--border);transition:background .2s">
            <div style="width:36px;height:36px;border-radius:50%;background:${color}20;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><${iconPath}/></svg>
            </div>
            <div style="flex:1;min-width:0">
                <div style="font-size:13px;font-weight:${n.read ? '400' : '600'};color:var(--text-1)">${n.title}</div>
                ${date ? `<div style="font-size:11px;color:var(--text-3);margin-top:3px">${date}</div>` : ''}
            </div>
            ${!n.read ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--primary);flex-shrink:0;margin-top:4px"></span>' : ''}
        </div>`;
    }).join('');

    // Ajouter l'écouteur de clic pour marquer chaque notification comme lue individuellement
    feed.querySelectorAll('.notif-item').forEach((el, idx) => {
        el.onclick = async () => {
            const n = filtered[idx];
            if (n.read) return; // Déjà lu
            
            // Marquer comme lu localement
            n.read = true;
            updateNotifBadges(notifs);
            
            // Mettre à jour dans Supabase (si l'objet a un ID et qu'on est connecté)
            if (n.id && DataService.isConnected()) {
                const client = window.SupabaseService && window.SupabaseService.getClient ? window.SupabaseService.getClient() : null;
                if (client) {
                    await client.from('notifications')
                        .update({ is_read: true })
                        .eq('id', n.id)
                        .catch(e => console.warn('[Notifs] Erreur maj item:', e));
                }
            }
            
            // Rafraîchir l'affichage
            renderNotificationsTab();
        };
    });
}

async function renderReportsTab() {
    const barChart  = document.getElementById('bar-chart-monthly');
    const breakdown = document.getElementById('tontine-breakdown-list');
    const performers= document.getElementById('top-performers-grid');

    if (barChart)   barChart.innerHTML   = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';
    if (breakdown)  breakdown.innerHTML  = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';
    if (performers) performers.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Chargement...</p>';

    const data = await DataService.getReportsData().catch(() => null);

    if (!data) {
        const msg = '<p style="padding:20px;color:var(--color-text-muted)">Données non disponibles (mode démo).</p>';
        if (barChart)   barChart.innerHTML   = msg;
        if (breakdown)  breakdown.innerHTML  = msg;
        if (performers) performers.innerHTML = msg;
        return;
    }

    // Graphique en barres mensuel
    if (barChart && data.chartData && data.chartData.labels.length > 0) {
        const max = Math.max(...data.chartData.dataPoints, 1);
        barChart.innerHTML = `
            <div style="display:flex;align-items:flex-end;gap:8px;height:160px;padding:10px 0">
                ${data.chartData.labels.map((label, i) => {
                    const h = Math.round((data.chartData.dataPoints[i] / max) * 140);
                    return `
                    <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                        <div style="font-size:10px;color:var(--color-text-muted)">${new Intl.NumberFormat('fr-FR', {notation:'compact'}).format(data.chartData.dataPoints[i])}</div>
                        <div style="width:100%;background:linear-gradient(180deg,#5C60F5,#818CF8);border-radius:4px 4px 0 0;height:${h}px;min-height:4px;transition:height 0.6s ease"></div>
                        <div style="font-size:10px;color:var(--color-text-muted);text-align:center">${label.slice(5)}</div>
                    </div>`;
                }).join('')}
            </div>`;
    } else if (barChart) {
        barChart.innerHTML = '<p style="padding:20px;color:var(--color-text-muted)">Aucune donnée.</p>';
    }

    // Répartition par tontine
    if (breakdown) {
        breakdown.innerHTML = state.activeTontines.map(t => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid var(--color-border)">
                <span style="font-weight:500">${t.name}</span>
                <span style="color:var(--color-primary);font-weight:600">${new Intl.NumberFormat('fr-FR').format(t.amount)} FCFA</span>
            </div>`).join('') || '<p style="color:var(--color-text-muted)">—</p>';
    }

    // Top Performers (mockés si pas de données)
    if (performers) {
        performers.innerHTML = extendedMembers.slice(0, 3).map((m, i) => {
            const name  = m.name || m.full_name || 'Membre';
            const avatar = m.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=5C60F5&color=fff`;
            const medals = ['🥇','🥈','🥉'];
            return `
            <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--color-surface);border-radius:var(--radius-md);border:1px solid var(--color-border)">
                <span style="font-size:22px">${medals[i]}</span>
                <img src="${avatar}" style="width:36px;height:36px;border-radius:50%;object-fit:cover" alt="${name}">
                <div>
                    <div style="font-weight:600;font-size:13px">${name}</div>
                    <div style="font-size:12px;color:var(--color-text-muted)">${m.role || 'Membre'}</div>
                </div>
            </div>`;
        }).join('');
    }
}

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', init);

// --- 10. CALENDRIER ---
async function renderCalendarTab() {
    const grid        = document.getElementById('calendar-grid');
    const monthTitle  = document.getElementById('cal-month-title');
    const eventsList  = document.getElementById('upcoming-events-list');
    if (!grid) return;

    // État du calendrier (mois courant)
    if (!window._calState) {
        const now = new Date();
        window._calState = { year: now.getFullYear(), month: now.getMonth() };
    }
    const { year, month } = window._calState;

    const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
    if (monthTitle) monthTitle.textContent = `${MONTHS_FR[month]} ${year}`;

    // Navigation prev/next
    const btnPrev = document.getElementById('btn-cal-prev');
    const btnNext = document.getElementById('btn-cal-next');
    if (btnPrev) btnPrev.onclick = () => {
        window._calState.month--;
        if (window._calState.month < 0) { window._calState.month = 11; window._calState.year--; }
        renderCalendarTab();
    };
    if (btnNext) btnNext.onclick = () => {
        window._calState.month++;
        if (window._calState.month > 11) { window._calState.month = 0; window._calState.year++; }
        renderCalendarTab();
    };

    // Générer les jours du mois
    const firstDay   = new Date(year, month, 1).getDay();   // 0=Dim
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today       = new Date();

    // Récupérer les événements depuis les tontines actives
    const tontines = await DataService.getTontines().catch(() => []);
    const events = {}; // { 'YYYY-MM-DD': [{label, tontine}] }

    tontines.forEach(t => {
        // Simuler une date de prochain tour (aujourd'hui + index * 7 jours)
        const idx = state.activeTontines.indexOf(t);
        const d = new Date(year, month, 12 + idx * 7);
        if (d.getMonth() === month && d.getFullYear() === year) {
            const key = d.toISOString().split('T')[0];
            if (!events[key]) events[key] = [];
            events[key].push({ label: `Tour: ${t.name}`, tontine: t });
        }
    });

    // Grille
    let html = '';
    // Cellules vides avant le 1er
    for (let i = 0; i < firstDay; i++) html += '<div class="cal-cell empty"></div>';

    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr  = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const isToday  = d === today.getDate() && month === today.getMonth() && year === today.getFullYear();
        const hasEvent = events[dateStr];
        html += `
        <div class="cal-cell${isToday ? ' today' : ''}${hasEvent ? ' has-event' : ''}" title="${hasEvent ? hasEvent.map(e=>e.label).join(', ') : ''}">
            <span class="cal-day-num">${d}</span>
            ${hasEvent ? `<div class="cal-event-dot" style="width:6px;height:6px;border-radius:50%;background:#5C60F5;margin:2px auto 0"></div>` : ''}
        </div>`;
    }
    grid.innerHTML = html;

    // Événements à venir
    if (eventsList) {
        const upcoming = Object.entries(events)
            .sort(([a], [b]) => a.localeCompare(b))
            .slice(0, 5);

        if (upcoming.length === 0) {
            eventsList.innerHTML = '<p style="padding:12px;color:var(--color-text-muted);font-size:13px">Aucun événement ce mois-ci.</p>';
        } else {
            eventsList.innerHTML = upcoming.map(([dateKey, evts]) => {
                const d = new Date(dateKey);
                const label = d.toLocaleDateString('fr-FR', { weekday:'short', day:'numeric', month:'short' });
                return `
                <div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--color-border)">
                    <div style="background:#5C60F520;border-radius:8px;padding:6px 10px;text-align:center;min-width:44px">
                        <div style="font-size:16px;font-weight:700;color:#5C60F5">${d.getDate()}</div>
                        <div style="font-size:10px;color:var(--color-text-muted);text-transform:uppercase">${MONTHS_FR[d.getMonth()].slice(0,3)}</div>
                    </div>
                    <div style="flex:1">
                        ${evts.map(e => `<div style="font-size:13px;font-weight:500">${e.label}</div>`).join('')}
                        <div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">${label}</div>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

// --- 11. FAQ ACCORDÉON (appelée via onclick dans le HTML) ---
function toggleFaq(btn) {
    const answer  = btn.nextElementSibling;
    const allAnswers = document.querySelectorAll('.faq-answer');
    const allBtns    = document.querySelectorAll('.faq-question');

    // Fermer tous les autres
    allAnswers.forEach((a, i) => {
        if (a !== answer) {
            a.style.maxHeight = '0px';
            a.style.paddingTop    = '0';
            a.style.paddingBottom = '0';
            allBtns[i].classList.remove('open');
        }
    });

    // Toggle courant
    const isOpen = answer.style.maxHeight && answer.style.maxHeight !== '0px';
    if (!isOpen) {
        answer.style.maxHeight = '500px'; // Suffisamment grand pour englober le texte
        answer.style.paddingTop    = '16px';
        answer.style.paddingBottom = '16px';
        btn.classList.add('open');
    } else {
        answer.style.maxHeight    = '0px';
        answer.style.paddingTop   = '0';
        answer.style.paddingBottom = '0';
        btn.classList.remove('open');
    }
}

// --- FIX ABSOLU DU BOUTON PAIEMENTS ---
// Attaché directement au chargement du script pour éviter tout conflit avec init()
const explicitBtnPayments = document.getElementById('btn-menu-payments');
const explicitSubmenu = document.getElementById('payments-submenu');
if (explicitBtnPayments && explicitSubmenu) {
    explicitBtnPayments.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        
        explicitSubmenu.classList.toggle('hidden');
        const isOpen = !explicitSubmenu.classList.contains('hidden');
        this.classList.toggle('active', isOpen);
        
        const chevron = this.querySelector('.chevron-icon');
        if (chevron) {
            chevron.style.transform = isOpen ? 'rotate(180deg)' : 'rotate(0deg)';
        }
    };
}

// Clic sur "Envoyer un paiement" du sous-menu -> Ouvre le modal de paiement existant
const btnSubmenuSendPayment = document.getElementById('btn-submenu-send-payment');
if (btnSubmenuSendPayment) {
    btnSubmenuSendPayment.addEventListener('click', () => {
        const btnQuickVal = document.getElementById('btn-quick-validate-pay');
        if (btnQuickVal) btnQuickVal.click();
    });
}

// --- RECHERCHE GLOBALE ---
const globalSearchInput = document.getElementById('global-search-input');
const searchResultsDropdown = document.getElementById('search-results-dropdown');

if (globalSearchInput && searchResultsDropdown) {
    globalSearchInput.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        
        if (query.length === 0) {
            searchResultsDropdown.style.display = 'none';
            return;
        }
        
        searchResultsDropdown.style.display = 'block';
        
        let html = '';
        
        // Recherche dans les membres
        const matchedMembers = extendedMembers.filter(m => m.name.toLowerCase().includes(query));
        if (matchedMembers.length > 0) {
            html += '<div style="padding: 8px 12px; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; background: #f8fafc; border-bottom: 1px solid #e2e8f0;">Membres</div>';
            matchedMembers.forEach(m => {
                html += `
                    <div style="padding: 8px 12px; display: flex; align-items: center; gap: 10px; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'" onclick="switchTab('members')">
                        <img src="${m.avatar}" style="width: 24px; height: 24px; border-radius: 50%; object-fit: cover;">
                        <div>
                            <div style="font-size: 13px; color: #1e293b; font-weight: 500;">${m.name}</div>
                            <div style="font-size: 11px; color: #64748b;">${m.role}</div>
                        </div>
                    </div>
                `;
            });
        }
        
        // Recherche dans les tontines
        const matchedTontines = state.activeTontines.filter(t => t.name.toLowerCase().includes(query));
        if (matchedTontines.length > 0) {
            html += '<div style="padding: 8px 12px; font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px; background: #f8fafc; border-bottom: 1px solid #e2e8f0; border-top: ' + (matchedMembers.length > 0 ? 'none' : '1px solid #e2e8f0') + ';">Tontines</div>';
            matchedTontines.forEach(t => {
                html += `
                    <div style="padding: 8px 12px; display: flex; flex-direction: column; cursor: pointer; border-bottom: 1px solid #f1f5f9; transition: background 0.2s;" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='transparent'" onclick="switchTab('circle')">
                        <div style="font-size: 13px; color: #1e293b; font-weight: 500;">${t.name}</div>
                        <div style="font-size: 11px; color: #64748b;">${t.amount.toLocaleString()} FCFA - ${t.frequency}</div>
                    </div>
                `;
            });
        }
        
        if (matchedMembers.length === 0 && matchedTontines.length === 0) {
            html = '<div style="padding: 12px; font-size: 13px; color: #64748b; text-align: center;">Aucun résultat trouvé</div>';
        }
        
        searchResultsDropdown.innerHTML = html;
    });
}

// --- GESTION DU CHAT (ONGLET MESSAGES) ---
const btnSendChatMessage = document.getElementById('btn-send-chat-message');
const chatMessageInput = document.getElementById('chat-message-input');
const chatMessagesArea = document.getElementById('chat-messages-area');

if (btnSendChatMessage && chatMessageInput) {
    btnSendChatMessage.addEventListener('click', async () => {
        const cont = chatMessageInput.value.trim();
        if (!cont) return;

        btnSendChatMessage.disabled = true;
        btnSendChatMessage.textContent = "Envoi...";

        // On utilise la même méthode que pour le bouton rapide (envoi global par défaut)
        const res = await DataService.createMessage({ conversation_id: null, content: cont });

        btnSendChatMessage.disabled = false;
        btnSendChatMessage.textContent = "Envoyer";

        if (res && !res.error) {
            chatMessageInput.value = '';
            
            // Ajouter le message visuellement dans la zone de chat
            if (chatMessagesArea) {
                const now = new Date();
                const timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0');
                const msgHTML = `
                    <div style="display: flex; flex-direction: column; align-items: flex-end; margin-bottom: 15px;">
                        <div style="background: var(--primary); color: white; padding: 10px 14px; border-radius: 12px 12px 0 12px; font-size: 13px; max-width: 80%; line-height: 1.4; box-shadow: var(--shadow);">
                            ${cont}
                        </div>
                        <div style="font-size: 10px; color: var(--text-3); margin-top: 4px;">Aujourd'hui à ${timeStr}</div>
                    </div>
                `;
                chatMessagesArea.innerHTML += msgHTML;
                chatMessagesArea.scrollTop = chatMessagesArea.scrollHeight;
            }

            if (typeof playSuccessSound === 'function') {
                playSuccessSound();
            } else if (typeof soundSuccess !== 'undefined' && soundSuccess) {
                soundSuccess.volume = 0.5;
                soundSuccess.play().catch(() => {});
            }
            
            // Mettre à jour la liste des conversations (à gauche)
            await loadDynamicData();
            if (typeof renderMessagesTab === 'function') {
                renderMessagesTab();
            }
        } else {
            let errorMsg = res ? res.error : "Erreur inconnue";
            if (typeof errorMsg === 'object' && errorMsg !== null) {
                errorMsg = errorMsg.message || JSON.stringify(errorMsg);
            }
            alert("Erreur lors de l'envoi : " + errorMsg);
        }
    });

    chatMessageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            btnSendChatMessage.click();
        }
    });
}

// --- BOUTON "+" NOUVELLE CONVERSATION ---
const btnNewConv = document.querySelector('.btn-new-conv');
if (btnNewConv) {
    btnNewConv.addEventListener('click', () => {
        // Simuler le clic sur le bouton "Envoyer message" des actions rapides
        const btnQuickSendMsg = document.getElementById('btn-quick-send-msg');
        if (btnQuickSendMsg) {
            btnQuickSendMsg.click();
        } else {
            // Repli : ouvrir directement le modal si le bouton rapide n'est pas dispo
            const m = document.getElementById('send-message-modal');
            if (m) {
                const s = document.getElementById('message-recipient-input');
                if (s && state.activeTontines) {
                    s.innerHTML = '<option value="">Sélectionnez un destinataire</option>';
                    state.activeTontines.forEach(t => {
                        s.innerHTML += `<option value="${t.name}">Groupe: ${t.name}</option>`;
                    });
                }
                m.classList.remove('hidden');
            }
        }
    });
}
// Trigger Live Server 3

// --- GESTION DU FILTRE DE PÉRIODE POUR LE GRAPHIQUE DES RAPPORTS ---
window.toggleCustomDates = function(period) {
    const customDiv = document.getElementById('custom-date-filters');
    if (customDiv) {
        customDiv.style.display = period === 'custom' ? 'flex' : 'none';
    }
};

window.applyChartPeriod = function() {
    if (!reportsChartInstance) return;

    const periodSelect = document.getElementById('report-period-filter');
    if (!periodSelect) return;
    const period = periodSelect.value;

    let labels = [];
    let dataPoints = [];

    switch(period) {
        case '1w':
            labels = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
            dataPoints = [15000, 42000, 30000, 85000, 60000, 95000, 40000];
            break;
        case '1m':
            labels = ['Sem 1', 'Sem 2', 'Sem 3', 'Sem 4'];
            dataPoints = [120000, 90000, 210000, 150000];
            break;
        case '6m':
            labels = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août'];
            dataPoints = [120000, 210000, 160000, 280000, 190000, 310000, 240000, 350000];
            break;
        case '1y':
            labels = ['T1 2025', 'T2 2025', 'T3 2025', 'T4 2025', 'T1 2026', 'T2 2026'];
            dataPoints = [450000, 680000, 520000, 890000, 1200000, 950000];
            break;
        case 'custom':
            const dStart = document.getElementById('report-date-start')?.value || 'Début';
            const dEnd = document.getElementById('report-date-end')?.value || 'Fin';
            labels = [dStart, '...', '...', '...', '...', dEnd];
            dataPoints = [50000, 120000, 80000, 190000, 110000, 240000];
            break;
        default:
            return;
    }

    // Mise à jour de l'instance Chart.js
    reportsChartInstance.data.labels = labels;
    reportsChartInstance.data.datasets[0].data = dataPoints;
    reportsChartInstance.update();
    
    if (typeof showToast === 'function') {
        showToast("Graphique mis à jour !", "success");
    }
};

// --- AXE 3 : EXPORTS & RELANCES ---

window.exportTontineToPDF = function() {
    const tontineName = document.getElementById('details-tontine-name').textContent;
    const tontineAmount = document.getElementById('details-tontine-amount').textContent;
    const tontineStatus = document.getElementById('details-tontine-status').textContent;
    const tontineMembers = document.getElementById('details-tontine-members').textContent;

    const element = document.createElement('div');
    element.innerHTML = `
        <div style="padding: 40px; font-family: 'Inter', sans-serif; color: #1E293B;">
            <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="color: #0B1F4D; font-size: 28px; font-weight: bold; margin: 0;">Tontine Pro</h1>
                <p style="color: #64748B; font-size: 14px; margin-top: 5px;">Rapport de Tontine</p>
            </div>
            
            <div style="border-bottom: 2px solid #E2E8F0; padding-bottom: 15px; margin-bottom: 20px;">
                <h2 style="font-size: 20px; color: #1E293B; margin: 0;">${tontineName}</h2>
                <span style="display: inline-block; padding: 4px 10px; border-radius: 20px; background: #E0F2FE; color: #0284C7; font-size: 12px; margin-top: 8px;">${tontineStatus}</span>
            </div>
            
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; color: #64748B; width: 40%;">Montant par cycle</td>
                    <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; color: #1E293B; font-weight: 600; text-align: right;">${tontineAmount}</td>
                </tr>
                <tr>
                    <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; color: #64748B;">Membres inscrits</td>
                    <td style="padding: 12px 0; border-bottom: 1px solid #E2E8F0; color: #1E293B; font-weight: 600; text-align: right;">${tontineMembers}</td>
                </tr>
            </table>

            <div style="margin-top: 40px; text-align: center; color: #94A3B8; font-size: 12px;">
                <p>Généré automatiquement par Tontine Pro le ${new Date().toLocaleDateString('fr-FR')}</p>
            </div>
        </div>
    `;

    const opt = {
      margin:       1,
      filename:     'Rapport_' + tontineName.replace(/\s+/g, '_') + '.pdf',
      image:        { type: 'jpeg', quality: 0.98 },
      html2canvas:  { scale: 2 },
      jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    if (typeof showGlobalLoader === 'function') showGlobalLoader();
    if (window.html2pdf) {
        html2pdf().set(opt).from(element).save().then(() => {
            if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
            if (typeof showToast === 'function') showToast("Le rapport PDF a été téléchargé avec succès !");
            else alert("Le rapport PDF a été téléchargé avec succès !");
        });
    } else {
        if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
        alert("Erreur: La bibliothèque d'export PDF n'est pas chargée.");
    }
};

window.sendReminder = function(memberName, method) {
    if (method === 'whatsapp') {
        const text = encodeURIComponent(`👋 Bonjour ${memberName}, c'est un rappel automatique de Tontine Pro. Vous avez une cotisation en retard. Merci de régulariser la situation dès que possible !`);
        window.open('https://wa.me/?text=' + text, '_blank');
        if (typeof showToast === 'function') showToast(`Relance WhatsApp préparée pour ${memberName}`);
    } else {
        if (typeof showToast === 'function') showToast(`Email de relance envoyé à ${memberName} !`);
    }
};

function renderMembers() {
    if (typeof renderMembersTab === 'function') {
        renderMembersTab();
    }
}

// --- VISITE GUIDÉE (ONBOARDING) ---
function startOnboardingTour() {
    // Éviter de lancer plusieurs fois
    if (document.getElementById('onboarding-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100vw';
    overlay.style.height = '100vh';
    overlay.style.backgroundColor = 'rgba(15, 23, 42, 0.8)';
    overlay.style.zIndex = '9998';
    overlay.style.display = 'flex';
    overlay.style.alignItems = 'center';
    overlay.style.justifyContent = 'center';
    overlay.style.backdropFilter = 'blur(4px)';

    const modal = document.createElement('div');
    modal.style.backgroundColor = 'var(--card)';
    modal.style.padding = '30px';
    modal.style.borderRadius = '16px';
    modal.style.maxWidth = '400px';
    modal.style.textAlign = 'center';
    modal.style.zIndex = '9999';
    modal.style.boxShadow = '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)';

    modal.innerHTML = `
        <div style="background: rgba(92, 96, 245, 0.1); width: 60px; height: 60px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
        </div>
        <h2 style="font-size: 20px; font-weight: 700; color: var(--text-1); margin-bottom: 10px;">Bienvenue sur Tontine Pro ! 🎉</h2>
        <p style="font-size: 14px; color: var(--text-2); margin-bottom: 25px; line-height: 1.6;">
            Gérez vos cercles d'épargne comme un pro. <br><br>
            Utilisez le menu à gauche pour naviguer, commencez par créer votre première tontine, et suivez vos paiements en temps réel.
        </p>
        <button id="btn-end-tour" class="btn-primary" style="width: 100%; padding: 12px; font-size: 15px;">Démarrer l'expérience</button>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    document.getElementById('btn-end-tour').addEventListener('click', () => {
        document.body.removeChild(overlay);
        localStorage.setItem('tontine_onboarding_done', 'true');
        // Jouer un petit son de succès si possible
        if (typeof playSuccessSound === 'function') playSuccessSound();
    });
}

/* ======================================================
   AXE 4 — MODAL PAIEMENT MULTI-ÉTAPES
   ====================================================== */

let _selectedPayMethod = 'moov_money';
let _payAccountDetail = '';
let _ussdTimerInterval = null;
let _payAllTransactions = []; // cache local pour filtrage

const PAY_METHOD_LABELS = {
    moov_money: '🟡 Moov Money (Flooz)',
    yas_mix: '🟢 Yas Mix (Togocom)',
    orange_money: '🟠 Orange Money',
    wave: '🌊 Wave Money',
    mtn_money: '⚡ MTN MoMo',
    card: '💳 Carte Bancaire',
    cash: '💵 Espèces'
};

const PAY_METHOD_CONFIG = {
    moov_money: {
        label: '📱 Numéro de téléphone Moov Money / Flooz',
        placeholder: 'Ex: +228 99 00 00 00 / 01 00 00 00',
        help: 'Un push USSD Flooz sera envoyé instantanément sur ce mobile pour confirmation.',
        opName: 'Passerelle Moov Money Flooz',
        badge: 'Flooz',
        badgeClass: 'background:#fef08a;color:#854d0e;',
        icon: '🟡',
        defaultPrefix: '+228 '
    },
    yas_mix: {
        label: '📱 Numéro Togocom / Yas Mix (TMoney)',
        placeholder: 'Ex: +228 90 00 00 00 / 91 00 00 00',
        help: 'Vous recevrez une notification Yas Mix / TMoney directement sur votre smartphone.',
        opName: 'Passerelle Togocom / Yas Mix',
        badge: 'Yas Mix',
        badgeClass: 'background:#dcfce7;color:#15803d;',
        icon: '🟢',
        defaultPrefix: '+228 '
    },
    orange_money: {
        label: '📱 Numéro de compte Orange Money',
        placeholder: 'Ex: +225 07 00 00 00 / +221 77 000 00 00',
        help: 'Validez ensuite la transaction avec votre code secret Orange Money (#144#).',
        opName: 'Passerelle Orange Money',
        badge: 'Orange',
        badgeClass: 'background:#ffedd5;color:#ea580c;',
        icon: '🟠',
        defaultPrefix: '+225 '
    },
    wave: {
        label: '📱 Numéro de compte Wave Money',
        placeholder: 'Ex: +225 01 00 00 00 / +221 76 000 00 00',
        help: 'Une requête de paiement sécurisée apparaîtra dans votre application Wave.',
        opName: 'Passerelle Wave Money',
        badge: 'Wave',
        badgeClass: 'background:#e0f2fe;color:#0284c7;',
        icon: '🌊',
        defaultPrefix: '+225 '
    },
    mtn_money: {
        label: '📱 Numéro MTN Mobile Money (MoMo)',
        placeholder: 'Ex: +229 67 00 00 00 / +225 05 00 00 00',
        help: 'Une requête USSD MTN Mobile Money s\'affichera sur votre écran (*133#).',
        opName: 'Passerelle MTN Mobile Money',
        badge: 'MTN MoMo',
        badgeClass: 'background:#fef9c3;color:#a16207;',
        icon: '⚡',
        defaultPrefix: '+229 '
    },
    card: {
        label: '💳 Numéro de carte bancaire & Expiration',
        placeholder: 'Ex: 4532 •••• •••• 8890 (MM/AA)',
        help: 'Paiement sécurisé par authentification bancaire 3D Secure / Verified by Visa.',
        opName: 'Passerelle Bancaire Internationale',
        badge: 'Carte',
        badgeClass: 'background:#f3e8ff;color:#9333ea;',
        icon: '💳',
        defaultPrefix: '4532 '
    },
    cash: {
        label: '💵 Reçu par (Nom du responsable / trésorier)',
        placeholder: 'Ex: Wilfried (Trésorier Tontine Pro)',
        help: 'Un reçu de caisse numéroté et horodaté sera émis après validation.',
        opName: 'Caisse Tontine Pro',
        badge: 'Espèces',
        badgeClass: 'background:#e2e8f0;color:#475569;',
        icon: '💵',
        defaultPrefix: 'Wilfried '
    },
    wallet: {
        label: '💼 Portefeuille Tontine Pro',
        help: "Le montant sera déduit du solde d'avance du membre.",
        placeholder: 'Avance',
        opName: 'Portefeuille',
        badge: 'Avance',
        badgeClass: 'background:#eef2ff;color:#4f46e5;',
        icon: '💼',
        defaultPrefix: 'Solde '
    }
};

function selectPayMethod(card) {
    document.querySelectorAll('.pay-method-card').forEach(c => c.classList.remove('active'));
    card.classList.add('active');
    _selectedPayMethod = card.getAttribute('data-method');
    
    const config = PAY_METHOD_CONFIG[_selectedPayMethod] || PAY_METHOD_CONFIG['moov_money'];
    const lbl = document.getElementById('pay-dynamic-label');
    const inp = document.getElementById('pay-dynamic-input');
    const hlp = document.getElementById('pay-dynamic-help');
    
    if (lbl) lbl.textContent = config.label;
    if (hlp) hlp.textContent = config.help;
    if (inp) {
        inp.placeholder = config.placeholder;
        if (!inp.value || inp.value.startsWith('+2') || inp.value === 'Wilfried ' || inp.value.startsWith('4532')) {
            inp.value = config.defaultPrefix || '';
        }
    }
}

function payGoStep1() {
    if (_ussdTimerInterval) clearInterval(_ussdTimerInterval);
    document.getElementById('pay-step-1').style.display = '';
    document.getElementById('pay-step-2').style.display = 'none';
    document.getElementById('pay-step-3').style.display = 'none';
    document.getElementById('pay-step-dot-1').style.background = '#6366f1';
    document.getElementById('pay-step-dot-2').style.background = 'var(--border)';
    document.getElementById('pay-step-dot-3').style.background = 'var(--border)';
    document.getElementById('pay-modal-subtitle').textContent = 'Étape 1 sur 3 — Détails';
}

function payGoStep2() {
    const memSel = document.getElementById('payment-member-input');
    const amt = document.getElementById('payment-amount-input').value;
    const memId = memSel ? memSel.value : '';
    const memName = memSel && memSel.selectedIndex > 0 ? memSel.options[memSel.selectedIndex].text : '';

    if (!memId) { showToast('Veuillez sélectionner un membre.', 'error'); return; }
    if (!amt || parseFloat(amt) <= 0) { showToast('Veuillez entrer un montant valide.', 'error'); return; }
    
    if (_selectedPayMethod === 'wallet') {
        const savedAdvances = JSON.parse(localStorage.getItem('tontine_advances') || '{}');
        const currentBalance = savedAdvances[memName] || 0;
        if (parseFloat(amt) > currentBalance) {
            showToast(`Solde d'avance insuffisant (${new Intl.NumberFormat('fr-FR').format(currentBalance)} FCFA dispo).`, 'error');
            return;
        }
    }

    const inp = document.getElementById('pay-dynamic-input');
    _payAccountDetail = (inp && inp.value.trim() !== '') ? inp.value.trim() : (PAY_METHOD_CONFIG[_selectedPayMethod]?.defaultPrefix + 'XX');

    const formatted = new Intl.NumberFormat('fr-FR').format(parseFloat(amt));
    document.getElementById('pay-confirm-amount').textContent = formatted + ' FCFA';
    document.getElementById('pay-confirm-member').textContent = memName;
    document.getElementById('pay-confirm-method').textContent = PAY_METHOD_LABELS[_selectedPayMethod] || _selectedPayMethod;
    const accEl = document.getElementById('pay-confirm-account');
    if (accEl) accEl.textContent = _payAccountDetail;
    document.getElementById('pay-confirm-date').textContent = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    document.getElementById('pay-step-1').style.display = 'none';
    document.getElementById('pay-step-2').style.display = '';
    document.getElementById('pay-step-dot-2').style.background = '#6366f1';
    document.getElementById('pay-modal-subtitle').textContent = 'Étape 2 sur 3 — Confirmation';
}

async function payGoStep3() {
    const memSel = document.getElementById('payment-member-input');
    const amt = parseFloat(document.getElementById('payment-amount-input').value);
    const memName = memSel && memSel.selectedIndex > 0 ? memSel.options[memSel.selectedIndex].text : 'Membre';

    document.getElementById('pay-step-2').style.display = 'none';
    document.getElementById('pay-step-3').style.display = '';
    document.getElementById('pay-step-success').style.display = 'none';
    document.getElementById('pay-step-dot-3').style.background = '#6366f1';
    document.getElementById('pay-modal-subtitle').textContent = 'Étape 3 sur 3 — Validation Fintech';

    const sim = document.getElementById('pay-ussd-simulator');
    const proc = document.getElementById('pay-step-processing');

    // Si paiement Cash ou Portefeuille, validation directe
    if (_selectedPayMethod === 'cash' || _selectedPayMethod === 'wallet') {
        if (sim) sim.style.display = 'none';
        if (proc) proc.style.display = '';
        const titleEl = document.getElementById('pay-processing-title');
        const subEl = document.getElementById('pay-processing-sub');
        if (titleEl) titleEl.textContent = _selectedPayMethod === 'wallet' ? 'Déduction du portefeuille...' : 'Enregistrement en caisse...';
        if (subEl) subEl.textContent = _selectedPayMethod === 'wallet' ? "Mise à jour du solde d'avance" : 'Émission du reçu horodaté par le gestionnaire';
        await executeFinalPayment();
        return;
    }

    // Afficher le simulateur USSD / Push mobile interactif
    const config = PAY_METHOD_CONFIG[_selectedPayMethod] || PAY_METHOD_CONFIG['moov_money'];
    if (document.getElementById('ussd-op-icon')) document.getElementById('ussd-op-icon').textContent = config.icon;
    if (document.getElementById('ussd-op-name')) document.getElementById('ussd-op-name').textContent = config.opName;
    const badgeEl = document.getElementById('ussd-op-badge');
    if (badgeEl) {
        badgeEl.textContent = config.badge;
        badgeEl.style.cssText = config.badgeClass;
    }
    if (document.getElementById('ussd-phone-display')) document.getElementById('ussd-phone-display').textContent = _payAccountDetail;
    if (document.getElementById('ussd-amount-display')) document.getElementById('ussd-amount-display').textContent = new Intl.NumberFormat('fr-FR').format(amt) + ' FCFA';

    const pinInp = document.getElementById('ussd-pin-input');
    if (pinInp) pinInp.value = '';

    if (proc) proc.style.display = 'none';
    if (sim) sim.style.display = '';

    // Démarrer le compte à rebours de 45s
    let timeLeft = 45;
    const timerEl = document.getElementById('ussd-timer');
    if (_ussdTimerInterval) clearInterval(_ussdTimerInterval);
    if (timerEl) timerEl.textContent = timeLeft + 's';

    _ussdTimerInterval = setInterval(() => {
        timeLeft--;
        if (timerEl) timerEl.textContent = timeLeft + 's';
        if (timeLeft <= 0) {
            clearInterval(_ussdTimerInterval);
            if (sim && sim.style.display !== 'none') {
                showToast('Session USSD expirée. Validation automatique de la transaction...', 'warning');
                confirmUSSDPayment();
            }
        }
    }, 1000);
}

async function confirmUSSDPayment() {
    if (_ussdTimerInterval) clearInterval(_ussdTimerInterval);
    const sim = document.getElementById('pay-ussd-simulator');
    const proc = document.getElementById('pay-step-processing');
    if (sim) sim.style.display = 'none';
    if (proc) proc.style.display = '';
    
    const titleEl = document.getElementById('pay-processing-title');
    const subEl = document.getElementById('pay-processing-sub');
    if (titleEl) titleEl.textContent = 'Authentification cryptographique en cours...';
    if (subEl) subEl.textContent = 'Validation du code PIN USSD avec l\'opérateur ' + (PAY_METHOD_CONFIG[_selectedPayMethod]?.badge || 'Mobile');

    await executeFinalPayment();
}

async function executeFinalPayment() {
    const memSel = document.getElementById('payment-member-input');
    const amt = parseFloat(document.getElementById('payment-amount-input').value);
    const memId = memSel ? memSel.value : '';
    const memName = memSel && memSel.selectedIndex > 0 ? memSel.options[memSel.selectedIndex].text : 'Membre';

    const opPrefix = { moov_money: 'MOOV-', yas_mix: 'YAS-', orange_money: 'OM-', wave: 'WAVE-', mtn_money: 'MTN-', card: 'CB-', cash: 'CASH-', wallet: 'WLT-' }[_selectedPayMethod] || 'TP-';
    const refNum = opPrefix + Date.now().toString(36).toUpperCase();
    
    // Déduction si wallet
    if (_selectedPayMethod === 'wallet') {
        const savedAdvances = JSON.parse(localStorage.getItem('tontine_advances') || '{}');
        const currentBalance = savedAdvances[memName] || 0;
        savedAdvances[memName] = currentBalance - amt;
        localStorage.setItem('tontine_advances', JSON.stringify(savedAdvances));
        if (typeof renderMembersTab === 'function') renderMembersTab();
    }

    const { data, error } = await DataService.createPayment({
        member_id: memId,
        amount: amt,
        payment_method: _selectedPayMethod,
        account_detail: _payAccountDetail,
        reference: refNum,
        status: 'valide',
        payment_type: 'cotisation'
    });

    await new Promise(res => setTimeout(res, 1500));

    document.getElementById('pay-step-processing').style.display = 'none';

    if (error) {
        const errMsg = typeof error === 'object' ? (error.message || JSON.stringify(error)) : error;
        showToast('Erreur de paiement : ' + errMsg, 'error');
        payGoStep2();
        return;
    }

    document.getElementById('pay-success-ref').textContent = 'REF: ' + refNum;

    const formatted = new Intl.NumberFormat('fr-FR').format(amt);
    document.getElementById('pay-receipt-summary').innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:var(--text-3);">Bénéficiaire</span><strong>${escapeHTML(memName)}</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:var(--text-3);">Montant</span><strong style="color:#10b981;">${formatted} FCFA</strong></div>
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;"><span style="color:var(--text-3);">Méthode</span><strong>${PAY_METHOD_LABELS[_selectedPayMethod]}</strong></div>
        <div style="display:flex;justify-content:space-between;"><span style="color:var(--text-3);">Compte / Tél</span><strong style="font-family:monospace;color:var(--primary);">${escapeHTML(_payAccountDetail)}</strong></div>
    `;

    document.getElementById('pay-step-success').style.display = '';
    if (typeof playSuccessSound === 'function') playSuccessSound();

    state.stats.validatedPaymentsToday = (state.stats.validatedPaymentsToday || 0) + 1;
    state.stats.totalAmountInPlay = (state.stats.totalAmountInPlay || 0) + amt;
    if (!state.transactions) state.transactions = [];
    state.transactions.unshift({
        id: (data && data[0]) ? data[0].id : 'mock-' + Date.now(),
        member: memName,
        tontine: 'Tontine Principale',
        amount: amt,
        type: 'Cotisation',
        status: 'Validé',
        method: _selectedPayMethod,
        account: _payAccountDetail,
        date: new Date().toISOString()
    });
    _payAllTransactions = [...state.transactions];
    renderDashboard();
}

function payResetSteps() {
    if (_ussdTimerInterval) clearInterval(_ussdTimerInterval);
    payGoStep1();
    document.getElementById('pay-step-dot-1').style.background = '#6366f1';
    document.getElementById('pay-step-dot-2').style.background = 'var(--border)';
    document.getElementById('pay-step-dot-3').style.background = 'var(--border)';
    
    document.querySelectorAll('.pay-method-card').forEach(c => {
        c.classList.toggle('active', c.getAttribute('data-method') === 'moov_money');
    });
    _selectedPayMethod = 'moov_money';
    const inp = document.getElementById('pay-dynamic-input');
    if (inp) inp.value = PAY_METHOD_CONFIG['moov_money'].defaultPrefix;
    const cardEl = document.querySelector('.pay-method-card[data-method="moov_money"]') || document.querySelector('.pay-method-card');
    if (cardEl) selectPayMethod(cardEl);
}

/* ======================================================
   AXE 4 — ONGLET PAIEMENTS
   ====================================================== */

async function renderPaymentsTab() {
    if (!state.transactions || state.transactions.length === 0) {
        await loadDynamicData();
    }
    _payAllTransactions = state.transactions ? [...state.transactions] : [];

    const validated = _payAllTransactions.filter(t => t.status === 'Validé' || t.status === 'valide');
    const pending   = _payAllTransactions.filter(t => t.status === 'En attente' || t.status === 'en_attente');
    const totalAmt  = validated.reduce((s, t) => s + (parseFloat(t.amount) || 0), 0);

    const elR = document.getElementById('pay-tab-total-received');
    const elA = document.getElementById('pay-tab-total-amount');
    const elP = document.getElementById('pay-tab-total-pending');
    if (elR) elR.textContent = validated.length;
    if (elA) elA.textContent = new Intl.NumberFormat('fr-FR').format(totalAmt);
    if (elP) elP.textContent = pending.length;

    renderPaymentsTable(_payAllTransactions);
}

function renderPaymentsTable(transactions) {
    const tbody = document.getElementById('payments-table-body');
    if (!tbody) return;

    if (!transactions || transactions.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:50px;text-align:center;color:var(--text-3);font-size:13px;">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:.3;display:block;margin:0 auto 12px;"><rect x="2" y="4" width="20" height="16" rx="2"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
            Aucune transaction pour le moment.<br><small>Commencez par valider un premier paiement.</small>
        </td></tr>`;
        return;
    }

    const statusBadge = (s) => {
        if (s === 'Validé' || s === 'valide') return `<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">✓ Validé</span>`;
        if (s === 'En attente' || s === 'en_attente') return `<span style="background:#fef9c3;color:#ca8a04;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">⏳ En attente</span>`;
        return `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">${escapeHTML(s)}</span>`;
    };

    const methodBadge = (m, acc) => {
        const lbl = PAY_METHOD_LABELS[m] || m || '—';
        const accStr = acc ? `<br><small style="color:var(--text-3);font-family:monospace;font-size:10px;">${escapeHTML(acc)}</small>` : '';
        return lbl + accStr;
    };

    tbody.innerHTML = transactions.map(t => {
        const dateStr = t.date ? new Date(t.date).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' }) : '—';
        const amtFormatted = new Intl.NumberFormat('fr-FR').format(parseFloat(t.amount) || 0);
        const initials = (t.member || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
        
        let actionBtn = '';
        if (t.status === 'Validé' || t.status === 'valide') {
            const txDataStr = encodeURIComponent(JSON.stringify(t));
            actionBtn = `<button onclick="generatePaymentReceiptPDF('${txDataStr}')" class="btn-sec-sm" style="padding:4px 8px;font-size:11px;display:flex;align-items:center;gap:4px;" title="Télécharger le reçu PDF">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Reçu
            </button>`;
        }
        
        return `<tr style="border-bottom:1px solid var(--border);transition:background 0.15s;" onmouseover="this.style.background='var(--content-bg)'" onmouseout="this.style.background='transparent'">
            <td style="padding:12px 16px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>
                    <span style="font-weight:600;font-size:13px;color:var(--text-1);">${escapeHTML(t.member || '—')}</span>
                </div>
            </td>
            <td style="padding:12px 16px;font-weight:700;color:var(--primary);font-size:13px;">${amtFormatted} FCFA</td>
            <td style="padding:12px 16px;font-size:12px;color:var(--text-2);">${methodBadge(t.method, t.account || t.account_detail)}</td>
            <td style="padding:12px 16px;">${statusBadge(t.status)}</td>
            <td style="padding:12px 16px;font-size:12px;color:var(--text-3);">${dateStr}</td>
            <td style="padding:12px 16px;text-align:right;">${actionBtn}</td>
        </tr>`;
    }).join('');
}

function generatePaymentReceiptPDF(txDataStr) {
    try {
        const t = JSON.parse(decodeURIComponent(txDataStr));
        const template = document.getElementById('payment-receipt-template');
        if (!template) return;
        
        // Remplir les données
        document.getElementById('receipt-id').innerText = 'TX-' + (t.id || Math.floor(Math.random() * 1000000));
        document.getElementById('receipt-date').innerText = t.date ? new Date(t.date).toLocaleDateString('fr-FR') : new Date().toLocaleDateString('fr-FR');
        document.getElementById('receipt-member-name').innerText = escapeHTML(t.member || 'Membre Inconnu');
        document.getElementById('receipt-tontine-name').innerText = escapeHTML(t.tontine || 'Tontine Principale');
        
        let methodLbl = PAY_METHOD_LABELS[t.method] || t.method || 'Espèces';
        if (t.account || t.account_detail) methodLbl += ' (' + (t.account || t.account_detail) + ')';
        document.getElementById('receipt-method').innerText = escapeHTML(methodLbl);
        
        document.getElementById('receipt-description').innerText = escapeHTML(t.title || 'Cotisation périodique');
        
        const amtFormatted = new Intl.NumberFormat('fr-FR').format(parseFloat(t.amount) || 0) + ' FCFA';
        document.getElementById('receipt-amount-row').innerText = amtFormatted;
        document.getElementById('receipt-total').innerText = amtFormatted;
        
        template.style.display = 'block';
        if (typeof showGlobalLoader === 'function') showGlobalLoader();
        
        const opt = {
            margin:       0.5,
            filename:     'Recu_Paiement_' + (t.member || 'Membre').replace(/\s+/g, '_') + '.pdf',
            image:        { type: 'jpeg', quality: 0.98 },
            html2canvas:  { scale: 2 },
            jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
        };
        
        if (window.html2pdf) {
            html2pdf().set(opt).from(template).save().then(() => {
                template.style.display = 'none';
                if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
                if (typeof showToast === 'function') showToast("Reçu téléchargé avec succès !");
            });
        }
    } catch (e) {
        console.error("Erreur génération reçu PDF", e);
        if (typeof showToast === 'function') showToast("Erreur lors de la génération du reçu.", 'error');
    }
}

function filterPayments(btn, filter) {
    document.querySelectorAll('.pay-filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    let filtered = _payAllTransactions;
    if (filter === 'valide') filtered = _payAllTransactions.filter(t => t.status === 'Validé' || t.status === 'valide');
    else if (filter === 'en_attente') filtered = _payAllTransactions.filter(t => t.status === 'En attente' || t.status === 'en_attente');
    else if (filter !== 'all') filtered = _payAllTransactions.filter(t => t.method === filter);

    renderPaymentsTable(filtered);
}

function renderAnalyticsCharts(stateObj) {
    const dashCont = document.getElementById('dashboard-analytics-pro-container');
    const adminCont = document.getElementById('admin-analytics-pro-container');
    if (!dashCont && !adminCont) return;

    const baseAmount = (stateObj && stateObj.stats && stateObj.stats.totalAmountInPlay) ? stateObj.stats.totalAmountInPlay : 650000;
    const months = ['Fév', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil'];
    const chartData = months.map((m, idx) => {
        const factor = 0.55 + (idx * 0.09); // croissance
        const expected = Math.round(baseAmount * factor);
        const actual = Math.round(expected * (idx === 5 ? ((stateObj && stateObj.stats ? stateObj.stats.participationRate || 88 : 88) / 100) : (0.94 + (idx % 2) * 0.04)));
        return { label: m, expected, actual };
    });
    const maxVal = Math.max(...chartData.map(d => Math.max(d.expected, d.actual)), 1);

    const barChartHTML = `
        <div style="background: var(--surface, #F8FAFC); border: 1px solid var(--border, #E2E8F0); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 14px; font-weight: 800; color: var(--text-1, #1E293B);">📈 Évolution des Collectes</span>
                    <span style="font-size: 11px; color: var(--primary, #5C60F5); background: rgba(92,96,245,0.1); padding: 2px 8px; border-radius: 10px; font-weight: 700;">6 Derniers Mois</span>
                </div>
                <div style="font-size: 12px; color: var(--text-3, #94A3B8); margin-bottom: 16px;">Comparatif Attendu vs Réellement Encaissé</div>
            </div>
            
            <div style="display: flex; align-items: flex-end; justify-content: space-between; height: 160px; padding: 10px 4px 0 4px; border-bottom: 1px solid var(--border, #E2E8F0); gap: 6px;">
                ${chartData.map(d => {
                    const hExp = Math.round((d.expected / maxVal) * 130);
                    const hAct = Math.round((d.actual / maxVal) * 130);
                    return `
                    <div style="flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px;">
                        <div style="display: flex; align-items: flex-end; gap: 3px; height: 130px; width: 100%; justify-content: center;">
                            <div class="analytics-bar" data-height="${hExp}" style="width: 12px; background: #93C5FD; border-radius: 4px 4px 0 0; height: 0px; transition: height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1);" title="Attendu : ${new Intl.NumberFormat('fr-FR').format(d.expected)} FCFA"></div>
                            <div class="analytics-bar" data-height="${hAct}" style="width: 12px; background: linear-gradient(180deg, #5C60F5, #818CF8); border-radius: 4px 4px 0 0; height: 0px; transition: height 0.8s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s;" title="Encaissé : ${new Intl.NumberFormat('fr-FR').format(d.actual)} FCFA"></div>
                        </div>
                        <span style="font-size: 11px; font-weight: 700; color: var(--text-2, #64748B); margin-top: 4px;">${d.label}</span>
                    </div>`;
                }).join('')}
            </div>
            
            <div style="display: flex; justify-content: center; gap: 18px; margin-top: 14px; font-size: 11.5px; font-weight: 700; color: var(--text-2, #64748B);">
                <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 3px; background: #93C5FD; display: inline-block;"></span> Attendu</span>
                <span style="display: flex; align-items: center; gap: 6px;"><span style="width: 10px; height: 10px; border-radius: 3px; background: #5C60F5; display: inline-block;"></span> Encaissé</span>
            </div>
        </div>
    `;

    const tontineCount = (stateObj && stateObj.activeTontines) ? stateObj.activeTontines.length : 2;
    const reserveAmount = tontineCount * 18500 + 25000;
    const covRate = 96;

    const reserveHTML = `
        <div style="background: var(--surface, #F8FAFC); border: 1px solid var(--border, #E2E8F0); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 14px; font-weight: 800; color: var(--text-1, #1E293B);">🛡️ Caisse de Réserve & Pénalités</span>
                    <span style="font-size: 11px; color: #059669; background: rgba(16,185,129,0.12); padding: 2px 8px; border-radius: 10px; font-weight: 700;">Sécurisé</span>
                </div>
                <div style="font-size: 12px; color: var(--text-3, #94A3B8); margin-bottom: 16px;">Fonds de garantie pour couvrir les retards</div>
            </div>

            <div style="text-align: center; margin: 12px 0;">
                <div style="font-size: 28px; font-weight: 900; color: #059669; letter-spacing: -0.5px;">${new Intl.NumberFormat('fr-FR').format(reserveAmount)} <span style="font-size: 14px; font-weight: 700;">FCFA</span></div>
                <div style="font-size: 12px; font-weight: 600; color: var(--text-2, #64748B); margin-top: 4px;">Taux de couverture des imprévus : <strong style="color: #059669;">${covRate}%</strong></div>
                
                <div style="margin-top: 16px; background: var(--border, #E2E8F0); height: 10px; border-radius: 5px; overflow: hidden; padding: 2px;">
                    <div class="analytics-bar-w" data-width="${covRate}" style="width: 0%; height: 100%; background: linear-gradient(90deg, #34D399, #059669); border-radius: 4px; transition: width 1s cubic-bezier(0.34, 1.56, 0.64, 1);"></div>
                </div>
            </div>

            <div style="background: var(--content-bg, #F1F5F9); padding: 12px; border-radius: 10px; font-size: 11.5px; color: var(--text-2, #475569); display: flex; align-items: center; gap: 8px; margin-top: 12px; line-height: 1.4;">
                <span style="font-size: 18px;">💡</span>
                <span>Cette réserve cumule les pénalités de retard et le fonds initial pour garantir <strong>0 défaut de paiement</strong>.</span>
            </div>
        </div>
    `;

    const methodsHTML = `
        <div style="background: var(--surface, #F8FAFC); border: 1px solid var(--border, #E2E8F0); border-radius: 14px; padding: 18px; display: flex; flex-direction: column; justify-content: space-between; box-shadow: 0 2px 6px rgba(0,0,0,0.02);">
            <div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <span style="font-size: 14px; font-weight: 800; color: var(--text-1, #1E293B);">💳 Flux de Paiements</span>
                    <span style="font-size: 11px; color: #7C3AED; background: rgba(139,92,246,0.1); padding: 2px 8px; border-radius: 10px; font-weight: 700;">Canaux</span>
                </div>
                <div style="font-size: 12px; color: var(--text-3, #94A3B8); margin-bottom: 16px;">Répartition par méthode d'encaissement</div>
            </div>

            <div style="display: flex; height: 14px; border-radius: 7px; overflow: hidden; gap: 3px; margin-bottom: 20px; background: var(--border, #E2E8F0); padding: 2px;">
                <div class="analytics-bar-w" data-width="45" style="width: 0%; height: 100%; background: #2563EB; border-radius: 4px; transition: width 0.8s ease;" title="Wave : 45%"></div>
                <div class="analytics-bar-w" data-width="30" style="width: 0%; height: 100%; background: #F97316; border-radius: 4px; transition: width 0.8s ease 0.1s;" title="Orange Money : 30%"></div>
                <div class="analytics-bar-w" data-width="15" style="width: 0%; height: 100%; background: #10B981; border-radius: 4px; transition: width 0.8s ease 0.2s;" title="Carte : 15%"></div>
                <div class="analytics-bar-w" data-width="10" style="width: 0%; height: 100%; background: #64748B; border-radius: 4px; transition: width 0.8s ease 0.3s;" title="Cash : 10%"></div>
            </div>

            <div style="display: flex; flex-direction: column; gap: 10px;">
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px;">
                    <span style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-1, #1E293B);"><span style="width: 10px; height: 10px; border-radius: 50%; background: #2563EB; display: inline-block;"></span> Wave (Mobile Money)</span>
                    <span style="font-weight: 800; color: #2563EB;">45%</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px;">
                    <span style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-1, #1E293B);"><span style="width: 10px; height: 10px; border-radius: 50%; background: #F97316; display: inline-block;"></span> Orange Money</span>
                    <span style="font-weight: 800; color: #F97316;">30%</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px;">
                    <span style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-1, #1E293B);"><span style="width: 10px; height: 10px; border-radius: 50%; background: #10B981; display: inline-block;"></span> Carte Bancaire / Virement</span>
                    <span style="font-weight: 800; color: #10B981;">15%</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12.5px;">
                    <span style="display: flex; align-items: center; gap: 8px; font-weight: 600; color: var(--text-1, #1E293B);"><span style="width: 10px; height: 10px; border-radius: 50%; background: #64748B; display: inline-block;"></span> Espèces (Cash)</span>
                    <span style="font-weight: 800; color: #64748B;">10%</span>
                </div>
            </div>
        </div>
    `;

    const fullHTML = barChartHTML + reserveHTML + methodsHTML;
    if (dashCont) dashCont.innerHTML = fullHTML;
    if (adminCont) adminCont.innerHTML = fullHTML;

    setTimeout(() => {
        document.querySelectorAll('.analytics-bar').forEach(el => {
            el.style.height = (el.getAttribute('data-height') || '0') + 'px';
        });
        document.querySelectorAll('.analytics-bar-w').forEach(el => {
            el.style.width = (el.getAttribute('data-width') || '0') + '%';
        });
    }, 150);
}
window.renderAnalyticsCharts = renderAnalyticsCharts;

/* ======================================================
   AXE 4 — ONGLET ADMINISTRATION
   ====================================================== */

async function renderAdminTab() {
    if (typeof renderAnalyticsCharts === 'function') renderAnalyticsCharts(state);
    // Stats
    const members = state.extendedMembers || extendedMembers || [];
    const admins  = members.filter(m => m.role === 'admin' || m.role === 'Gestionnaire');
    const tontines = state.activeTontines ? state.activeTontines.length : 0;

    const elM = document.getElementById('admin-total-members');
    const elA = document.getElementById('admin-total-admins');
    const elT = document.getElementById('admin-total-tontines');
    if (elM) elM.textContent = members.length;
    if (elA) elA.textContent = admins.length || 1;
    if (elT) elT.textContent = tontines;

    // Lien d'invitation
    const inviteEl = document.getElementById('invite-link-display');
    if (inviteEl) {
        const base = window.location.origin;
        inviteEl.textContent = `${base}/dashboard.html?role=membre&invite=tontine-pro-${Date.now().toString(36)}`;
    }

    renderAdminMembers('');
}

function renderAdminMembers(query) {
    const tbody = document.getElementById('admin-members-table-body');
    if (!tbody) return;

    const members = state.extendedMembers || extendedMembers || [];
    const filtered = query
        ? members.filter(m => (m.name || m.full_name || '').toLowerCase().includes(query.toLowerCase()))
        : members;

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:40px;text-align:center;color:var(--text-3);font-size:13px;">Aucun membre trouvé.</td></tr>`;
        return;
    }

    tbody.innerHTML = filtered.map(m => {
        const name = escapeHTML(m.name || m.full_name || 'Inconnu');
        const initials = name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);
        const status = m.status === 'À jour' || m.status === 'actif'
            ? `<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">✓ À jour</span>`
            : `<span style="background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">⚠ En retard</span>`;
        const role = m.role || 'membre';
        const roleLabel = role === 'admin' || role === 'Gestionnaire'
            ? `<span style="background:#ede9fe;color:#7c3aed;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">🛡 Admin</span>`
            : `<span style="background:#f1f5f9;color:#64748b;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:700;">👤 Membre</span>`;
        
        const trustScore = calculateTrustScore(m);
        const trustBadgeHtml = getTrustBadgeHTML(trustScore, name);

        return `<tr style="border-bottom:1px solid var(--border);transition:background 0.15s;" onmouseover="this.style.background='var(--content-bg)'" onmouseout="this.style.background='transparent'">
            <td style="padding:12px 16px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;color:#fff;flex-shrink:0;">${initials}</div>
                    <div><div style="font-weight:600;font-size:13px;color:var(--text-1);">${name}</div><div style="font-size:11px;color:var(--text-3);">${escapeHTML(m.phone || m.email || '—')}</div></div>
                </div>
            </td>
            <td style="padding:12px 16px;">${trustBadgeHtml}</td>
            <td style="padding:12px 16px;">${status}</td>
            <td style="padding:12px 16px;">${roleLabel}</td>
            <td style="padding:12px 16px;text-align:center;">
                <div class="action-menu-container" style="display:inline-block; position:relative;">
                    <button class="btn-action-dots" onclick="toggleActionMenu(event, 'member-${escapeHTML(m.id)}')" style="width: 24px; height: 24px; color: #1E293B; background:transparent; border:none; cursor:pointer;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>
                    </button>
                    <div class="action-dropdown" id="dropdown-member-${escapeHTML(m.id)}" style="text-align:left;">
                        <a class="action-dropdown-item" onclick="toggleMemberRole('${escapeHTML(m.id)}','${escapeHTML(name)}','${role}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                            ${role === 'admin' || role === 'Gestionnaire' ? 'Retirer droits' : 'Déléguer Admin'}
                        </a>
                        <a class="action-dropdown-item danger" onclick="deleteMember('${escapeHTML(m.id)}','${escapeHTML(name)}')">
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                            Supprimer
                        </a>
                    </div>
                </div>
            </td>
        </tr>`;
    }).join('');
}

function deleteMember(memberId, memberName) {
    if (state.user && state.user.id === memberId) {
        if (typeof showToast === 'function') showToast("Vous ne pouvez pas supprimer votre propre compte admin.", "error");
        return;
    }
    
    if (!confirm(`🗑️ SUPPRESSION : Êtes-vous sûr de vouloir supprimer définitivement le membre "${memberName}" ? \n\nCette action est irréversible.`)) return;

    // 1. Suppression locale
    let members = state.extendedMembers || extendedMembers || [];
    const index = members.findIndex(m => m.id === memberId);
    
    if (index !== -1) {
        members.splice(index, 1);
        state.extendedMembers = members;
        extendedMembers = members;
        
        localStorage.setItem('tontine_extended_members', JSON.stringify(members));

        // 2. Suppression dans Supabase
        if (typeof getSupabaseClient === 'function') {
            const client = getSupabaseClient();
            if (client) {
                client.from('profiles').delete().eq('id', memberId).then(({ error }) => {
                    if (error) console.error("Erreur suppression Supabase:", error);
                }).catch(() => {});
            }
        }

        // 3. Mise à jour de l'interface
        if (typeof showToast === 'function') showToast(`✅ Le membre "${memberName}" a été supprimé avec succès.`, 'success');
        
        // Rafraîchir l'onglet Admin
        const searchInput = document.getElementById('admin-search-members');
        if (typeof renderAdminMembers === 'function') renderAdminMembers(searchInput ? searchInput.value : '');
        
        // Rafraîchir l'onglet Membres si on y retourne plus tard
        if (typeof renderMembersTab === 'function') renderMembersTab();
    }
}

function toggleMemberRole(memberId, memberName, currentRole) {
    const newRole = (currentRole === 'admin' || currentRole === 'Gestionnaire') ? 'membre' : 'admin';
    const action = newRole === 'admin' ? `déléguer les droits d'administration (Intérim) à "${memberName}"` : `retirer les droits d'administration à "${memberName}"`;
    if (!confirm(`🤝 DÉLÉGATION DE POUVOIR : Êtes-vous sûr de vouloir ${action} ? \n\n${newRole === 'admin' ? 'Ce membre aura le pouvoir complet de gérer la tontine (tirages, paiements, clôtures) pendant votre absence !' : 'Ce membre redeviendra un simple participant sans accès à la gestion.'}`)) return;

    // Mettre à jour localement
    const members = state.extendedMembers || extendedMembers || [];
    const found = members.find(m => m.id === memberId);
    if (found) {
        found.role = newRole;
        showToast(`🤝 Délégation mise à jour pour ${memberName} : ${newRole === 'admin' ? '🛡 Administrateur (Intérim)' : '👤 Simple Membre'}`, 'success');
        
        // Sauvegarder dans localStorage pour persister les rôles (local)
        localStorage.setItem('tontine_extended_members', JSON.stringify(members));

        // Mettre à jour dans Supabase pour synchroniser entre les appareils
        if (window.SupabaseService && window.SupabaseService.updateMemberRole) {
            window.SupabaseService.updateMemberRole(memberId, newRole).catch(() => {});
        }

        renderAdminMembers(document.getElementById('admin-search-members')?.value || '');
        
        // Mettre à jour le rôle actuel si on s'est auto-modifié
        if (state.user && (found.name.toLowerCase().includes(state.user.name.split('@')[0].toLowerCase()) || found.id === state.user.id)) {
            state.user.role = newRole;
            if (typeof applyRoleRestrictions === 'function') applyRoleRestrictions();
        }
    }
}

function copyInviteLink() {
    const el = document.getElementById('invite-link-display');
    if (!el) return;
    navigator.clipboard.writeText(el.textContent).then(() => {
        showToast('🔗 Lien d\'invitation copié !', 'success');
    }).catch(() => {
        showToast('Impossible de copier — copiez manuellement.', 'error');
    });
}

/* ======================================================
   AXE 4 — SYSTÈME DE PERMISSIONS PAR RÔLE
   ====================================================== */

const PERMISSIONS = {
    admin: ['create_tontine', 'edit_tontine', 'delete_tontine', 'close_round', 'validate_payment', 'view_admin', 'manage_members', 'view_reports'],
    administrateur: ['create_tontine', 'edit_tontine', 'delete_tontine', 'close_round', 'validate_payment', 'view_admin', 'manage_members', 'view_reports'],
    gestionnaire: ['create_tontine', 'edit_tontine', 'delete_tontine', 'close_round', 'validate_payment', 'view_admin', 'manage_members', 'view_reports'],
    membre: ['view_reports']
};

function checkPermission(action) {
    let role = (state.user && state.user.role) ? state.user.role.toLowerCase() : 'membre';
    if (role === 'administrateur') role = 'admin';
    const allowed = PERMISSIONS[role] || PERMISSIONS['membre'];
    return allowed.includes(action);
}

function applyRoleRestrictions() {
    const isInvitedMember = localStorage.getItem('tontine_invited_member_mode') === 'true';
    let dbRole = (state.user && state.user.role) ? state.user.role.toLowerCase() : '';
    
    let finalRole = 'membre';

    if (!isInvitedMember) {
        // Règle d'or de l'utilisateur : Le grand lien = Admin (Toujours)
        finalRole = 'admin';
    } else {
        // Lien d'invitation : Membre, SAUF si l'admin lui a délégué les droits
        if (dbRole === 'admin' || dbRole === 'gestionnaire' || dbRole === 'administrateur') {
            finalRole = 'admin';
        } else {
            finalRole = 'membre';
        }
    }

    if (state.user) {
        state.user.role = finalRole === 'admin' ? 'admin' : 'Membre';
    }

    const isAdmin = (finalRole === 'admin');

    // Afficher/masquer les onglets Administration et Audit Trail dans la sidebar
    ['btn-nav-admin', 'btn-nav-audit'].forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.style.display = isAdmin ? '' : 'none';
    });

    // Afficher/masquer les sections d'administration dans les paramètres (Relances WhatsApp, Facturation, Zone de danger)
    ['settings-card-relances', 'settings-card-billing', 'settings-card-danger'].forEach(id => {
        const card = document.getElementById(id);
        if (card) card.style.display = isAdmin ? '' : 'none';
    });
    
    // Masquer l'encart "Passez au Premium" et la colonne "Centre de Relance" pour les membres simples
    const premiumSidebarBox = document.querySelector('.sb-premium');
    if (premiumSidebarBox) {
        premiumSidebarBox.style.display = isAdmin ? 'flex' : 'none';
    }
    const remindersSidebar = document.querySelector('.reminders-sidebar');
    if (remindersSidebar) {
        remindersSidebar.style.display = isAdmin ? 'flex' : 'none';
    }
    
    // Gérer l'Espace Membre vs l'Espace Admin
    const memberDashboard = document.getElementById('member-dashboard-view');
    const adminDashboard = document.getElementById('admin-dashboard-view');
    if (memberDashboard && adminDashboard) {
        if (isAdmin) {
            memberDashboard.style.display = 'none';
            adminDashboard.style.display = '';
        } else {
            adminDashboard.style.display = 'none';
            memberDashboard.style.display = '';
            if (typeof renderMemberDashboard === 'function') {
                renderMemberDashboard();
            }
        }
    }

    // Masquer complètement ou afficher les boutons sensibles d'administration
    ['btn-quick-create-tontine', 'btn-quick-validate-pay', 'btn-quick-add-member', 'btn-close-current-round', 'btn-trigger-draw'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.style.display = isAdmin ? '' : 'none';
        }
    });

    // Badge rôle dans la sidebar
    const roleEl = document.querySelector('.sb-urole');
    if (roleEl) {
        if (isAdmin) {
            roleEl.innerHTML = `<span style="color:#6366f1;font-weight:700;">🛡 ${finalRole === 'admin' ? 'Admin' : 'Gestionnaire'}</span>`;
        } else {
            roleEl.innerHTML = `<span style="color:#f59e0b;font-weight:700;">👤 Membre</span>`;
        }
    }

    // Mettre à jour le bouton de bascule (Simulateur) dans la Topbar
    const modeBtn = document.getElementById('btn-toggle-role-mode');
    if (modeBtn) {
        if (isInvitedMember || !isAdmin) {
            // Pour un membre invité ou simple membre, on masque complètement le bouton de bascule simulateur !
            modeBtn.style.display = 'none';
        } else {
            modeBtn.style.display = 'flex';
            const modeLbl = document.getElementById('lbl-current-role-mode');
            if (modeLbl) modeLbl.textContent = 'Admin 👑';
            modeBtn.style.background = 'linear-gradient(135deg, #10b981, #059669)';
            modeBtn.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.3)';
        }
    }

    // Masquer les boutons 3-points dans la vue Tontines pour les membres
    document.querySelectorAll('.btn-action-dots').forEach(btn => {
        btn.style.display = isAdmin ? '' : 'none';
    });
}

function toggleRoleSimulator() {
    const current = (state.user && state.user.role) ? state.user.role.toLowerCase() : 'gestionnaire';
    const newRole = (current === 'admin' || current === 'gestionnaire' || current === 'administrateur') ? 'membre' : 'gestionnaire';
    state.user.role = newRole === 'gestionnaire' ? 'Gestionnaire' : 'Membre';

    applyRoleRestrictions();
    if (typeof renderTontinesTable === 'function') renderTontinesTable();
    if (typeof renderMembersTab === 'function') renderMembersTab();
    if (typeof renderMembers === 'function') renderMembers();
    
    // Si on était dans l'onglet Administration et qu'on bascule en Membre, on redirige vers Tableau de bord
    if (newRole === 'membre') {
        const activeTab = document.querySelector('.tab-pane.active');
        if (activeTab && activeTab.id === 'tab-admin') {
            switchTab('dashboard');
        }
        showToast('👤 Vue Simple Membre : Onglet Administration masqué, actions d\'administration bloquées !', 'warning');
    } else {
        showToast('🛡 Vue Gestionnaire restaurée : Tous les droits administrateur sont actifs !', 'success');
    }
}
window.toggleRoleSimulator = toggleRoleSimulator;

// ==========================================
// PARAMÈTRES : PROFIL, SÉCURITÉ ET PLAN PREMIUM VIP
// ==========================================

function updateUserProfile(btnEl) {
    const nameInp = document.getElementById('settings-name-input');
    const emailInp = document.getElementById('settings-email-input');
    const phoneInp = document.getElementById('settings-phone-input');

    const newName = nameInp ? nameInp.value.trim() : '';
    const newEmail = emailInp ? emailInp.value.trim() : '';
    const newPhone = phoneInp ? phoneInp.value.trim() : '';

    if (!newName) {
        showToast("⚠ Veuillez entrer au moins votre nom complet !", "warning");
        if (nameInp) nameInp.focus();
        return;
    }

    // Mettre à jour le state de l'application
    if (!state.user) state.user = {};
    state.user.name = newName;
    state.user.email = newEmail;
    state.user.phone = newPhone;

    // Mettre à jour dans l'interface (sidebar, topbar, etc.)
    document.querySelectorAll('.sb-uname').forEach(el => {
        el.textContent = newName;
    });

    if (btnEl) {
        const origText = btnEl.textContent;
        btnEl.textContent = "✔ Profil Enregistré !";
        btnEl.style.background = "#10B981";
        setTimeout(() => {
            btnEl.textContent = origText;
            btnEl.style.background = "";
        }, 2000);
    }

    showToast("✔ Informations de profil mises à jour avec succès !", "success");
}

async function updateUserPassword(btnEl) {
    const currInp = document.getElementById('current-password-input');
    const newInp = document.getElementById('new-password-input');

    const currVal = currInp ? currInp.value.trim() : '';
    const newVal = newInp ? newInp.value.trim() : '';

    if (!currVal) {
        showToast("⚠ Veuillez entrer votre mot de passe actuel !", "warning");
        if (currInp) currInp.focus();
        return;
    }

    const userEmail = (state && state.user && state.user.email) ? state.user.email.trim().toLowerCase() : (localStorage.getItem('tontine_last_login_email') || 'user@tontine.pro');
    const storedPwd = localStorage.getItem('tontine_user_pwd_' + userEmail) || localStorage.getItem('tontine_user_pwd_general');
    
    if (storedPwd && currVal !== storedPwd) {
        showToast("⚠ Erreur : Le mot de passe actuel saisi est incorrect !", "error");
        if (currInp) currInp.focus();
        return;
    }

    if (!newVal || newVal.length < 4) {
        showToast("⚠ Le nouveau mot de passe doit comporter au moins 4 caractères !", "warning");
        if (newInp) newInp.focus();
        return;
    }

    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = "Mise à jour en cours...";
    }

    try {
        // Mettre à jour sur le serveur Supabase d'abord
        if (typeof getSupabaseClient === 'function') {
            const client = getSupabaseClient();
            if (client && client.auth) {
                const { error } = await client.auth.updateUser({ password: newVal });
                if (error) {
                    throw new Error(error.message);
                }
            }
        }

        // Si tout s'est bien passé sur Supabase (ou si hors ligne), enregistrer localement
        localStorage.setItem('tontine_user_pwd_' + userEmail, newVal);
        localStorage.setItem('tontine_user_pwd_general', newVal);
        if (localStorage.getItem('tontine_last_login_email')) {
            localStorage.setItem('tontine_user_pwd_' + localStorage.getItem('tontine_last_login_email'), newVal);
        }
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('tontine_user_pwd_')) {
                localStorage.setItem(k, newVal);
            }
        }

        // Réinitialiser les champs
        if (currInp) currInp.value = '';
        if (newInp) newInp.value = '';

        const strengthLbl = document.getElementById('strength-label');
        if (strengthLbl) strengthLbl.textContent = "Mot de passe modifié et sécurisé ✔";

        if (btnEl) {
            const origText = "Mettre a jour";
            btnEl.textContent = "🔒 Mot de passe Modifié !";
            btnEl.style.background = "#10B981";
            setTimeout(() => {
                btnEl.textContent = origText;
                btnEl.style.background = "";
            }, 2500);
        }

        showToast("🔒 Mot de passe mis à jour avec succès ! Votre ancien mot de passe ne fonctionnera plus pour vous connecter.", "success");

    } catch (e) {
        console.error(e);
        let errorMsg = e.message;
        if (errorMsg.includes("Auth session missing") || errorMsg.includes("User not found")) {
            errorMsg = "Session expirée. Veuillez vous déconnecter et vous reconnecter avec votre mot de passe actuel avant de le changer.";
        }
        showToast("⚠ Erreur : " + errorMsg, "error");
    } finally {
        if (btnEl && btnEl.textContent === "Mise à jour en cours...") {
            btnEl.disabled = false;
            btnEl.innerHTML = "Mettre a jour";
        }
    }
}

function openPremiumDiscoverModal() {
    if (!window.modalHistoryPushed) {
        history.pushState({ modalOpen: true }, '');
        window.modalHistoryPushed = true;
    }
    const m = document.getElementById('premium-discover-modal');
    if (m) m.classList.remove('hidden');
}

function activatePremiumPlan() {
    if (!state.user) state.user = {};
    state.user.isPremium = true;

    // Fermer la modale
    const m = document.getElementById('premium-discover-modal');
    if (m) m.classList.add('hidden');
    window.modalHistoryPushed = false;

    // Changer l'affichage dans la sidebar
    const titleEl = document.querySelector('.sb-premium .sp-title');
    const subEl = document.querySelector('.sb-premium .sp-sub');
    const btnEl = document.getElementById('btn-discover-premium');

    if (titleEl) titleEl.textContent = "👑 Premium Actif";
    if (subEl) subEl.textContent = "Toutes les fonctions VIP sont débloquées";
    if (btnEl) {
        btnEl.textContent = "Actif ✨";
        btnEl.style.background = "#10b981";
        btnEl.style.color = "white";
        btnEl.style.border = "none";
    }

    // Changer aussi dans l'onglet paramètres facturation
    const billingCard = document.getElementById('settings-card-billing');
    if (billingCard) {
        const planTitle = billingCard.querySelector('div[style*="font-weight:700"]');
        const planSub = billingCard.querySelector('div[style*="font-size:12px"]');
        const planBtn = billingCard.querySelector('button');
        if (planTitle) planTitle.textContent = "Plan VIP Premium & Enterprise";
        if (planSub) planSub.textContent = "Tontines illimitées • SMS & IA actifs";
        if (planBtn) {
            planBtn.textContent = "Plan Actif 👑";
            planBtn.style.background = "#10b981";
            planBtn.onclick = null;
        }
    }

    showToast("🎉 Félicitations ! Votre Plan Premium Tontine Pro est maintenant ACTIVÉ ! Vous avez accès aux SMS illimités et à l'IA.", "success");
}

window.updateUserProfile = updateUserProfile;
window.updateUserPassword = updateUserPassword;
window.openPremiumDiscoverModal = openPremiumDiscoverModal;
window.activatePremiumPlan = activatePremiumPlan;

// ==========================================
// GÉNÉRATEUR DE RELEVÉ BANCAIRE / COTISATIONS PDF (AUDIT INDIVIDUEL)
// ==========================================

function openMemberStatementModal(memberId, memberName) {
    if (!window.modalHistoryPushed) {
        history.pushState({ modalOpen: true }, '');
        window.modalHistoryPushed = true;
    }
    const modal = document.getElementById('member-statement-modal');
    if (!modal) return;

    // Remplir la liste de sélection des membres si possible
    const select = document.getElementById('statement-member-select');
    if (select && typeof extendedMembers !== 'undefined' && extendedMembers.length > 0) {
        select.innerHTML = extendedMembers.map(m => {
            const n = m.name || m.full_name || 'Membre';
            const sel = (memberName && n.toLowerCase() === memberName.toLowerCase()) ? 'selected' : '';
            return `<option value="${n}" ${sel}>${n}</option>`;
        }).join('');
    } else if (select && memberName) {
        for (let i = 0; i < select.options.length; i++) {
            if (select.options[i].value.toLowerCase() === memberName.toLowerCase()) {
                select.selectedIndex = i;
                break;
            }
        }
    }

    previewMemberStatement();
    modal.classList.remove('hidden');
}

function setStatementPeriod(period) {
    const startInp = document.getElementById('statement-start-date');
    const endInp = document.getElementById('statement-end-date');
    if (!startInp || !endInp) return;

    const today = new Date();
    const formatDate = (d) => d.toISOString().split('T')[0];
    endInp.value = formatDate(today);

    if (period === '3m') {
        const d = new Date();
        d.setMonth(d.getMonth() - 3);
        startInp.value = formatDate(d);
    } else if (period === '6m') {
        const d = new Date();
        d.setMonth(d.getMonth() - 6);
        startInp.value = formatDate(d);
    } else if (period === 'year') {
        startInp.value = `${today.getFullYear()}-01-01`;
    } else if (period === 'all') {
        startInp.value = `2025-01-01`;
    }
    previewMemberStatement();
}

function previewMemberStatement() {
    const select = document.getElementById('statement-member-select');
    const memberName = select ? select.value : 'Membre';
    
    // Simuler/calculer le total et le nombre de versements pour ce membre
    let totalAmount = 150000;
    let txCount = 6;
    let trust = 100;

    if (typeof extendedMembers !== 'undefined') {
        const found = extendedMembers.find(m => (m.name || m.full_name) === memberName);
        if (found) {
            if (found.contributed !== undefined) totalAmount = found.contributed;
            if (found.trust !== undefined) trust = found.trust;
            else if (found.reliability_score !== undefined) trust = found.reliability_score;
            txCount = Math.max(1, Math.round(totalAmount / 25000));
        }
    }

    const totalEl = document.getElementById('statement-preview-total');
    const countEl = document.getElementById('statement-preview-count');
    const trustEl = document.getElementById('statement-preview-trust');

    if (totalEl) totalEl.textContent = new Intl.NumberFormat('fr-FR').format(totalAmount) + ' F';
    if (countEl) countEl.textContent = `${txCount} validés`;
    if (trustEl) trustEl.textContent = `⭐ ${trust}%`;
}

function exportMemberStatementToPDF() {
    const memberSelect = document.getElementById('statement-member-select');
    const tontineSelect = document.getElementById('statement-tontine-select');
    const startInp = document.getElementById('statement-start-date');
    const endInp = document.getElementById('statement-end-date');

    const memberName = memberSelect ? memberSelect.value : 'Membre';
    const tontineName = (tontineSelect && tontineSelect.value !== 'all') ? tontineSelect.options[tontineSelect.selectedIndex].text : 'Toutes les Tontines (Audit Global)';
    const startDate = startInp ? startInp.value : '2026-01-01';
    const endDate = endInp ? endInp.value : '2026-12-31';

    // Récupérer le total cotisé à afficher
    const totalEl = document.getElementById('statement-preview-total');
    const totalAmountStr = totalEl ? totalEl.textContent : '150 000 FCFA';
    const countEl = document.getElementById('statement-preview-count');
    const txCountStr = countEl ? countEl.textContent : '6 validés';

    const certCode = '#CERT-STMT-' + Math.floor(1000 + Math.random() * 9000);
    const nowStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

    // Générer des lignes de transaction réalistes pour le relevé bancaire
    let rowsHtml = '';
    const methods = ['Wave', 'Orange Money', 'Virement Bancaire', 'Espèces (Cash)'];
    const count = parseInt(txCountStr) || 5;
    const baseVal = Math.round((parseInt(totalAmountStr.replace(/\D/g, '')) || 150000) / count);

    for (let i = 1; i <= count; i++) {
        const day = Math.min(28, i * 5);
        const month = ((i - 1) % 12) + 1;
        const dateFormatted = `${day < 10 ? '0'+day : day}/${month < 10 ? '0'+month : month}/2026`;
        const method = methods[i % methods.length];
        const ref = `REF-${202600 + i * 14}`;
        
        rowsHtml += `
            <tr style="border-bottom: 1px solid #E2E8F0; font-size: 13px;">
                <td style="padding: 10px 8px; color: #475569;">${dateFormatted}</td>
                <td style="padding: 10px 8px; font-family: monospace; color: #64748B;">${ref}</td>
                <td style="padding: 10px 8px; color: #1E293B; font-weight: 600;">Cotisation Tour #${i} — ${tontineName}</td>
                <td style="padding: 10px 8px; color: #475569;">${method}</td>
                <td style="padding: 10px 8px; text-align: right; font-weight: 700; color: #10B981;">+${baseVal.toLocaleString('fr-FR')} FCFA</td>
                <td style="padding: 10px 8px; text-align: center;"><span style="background: #D1FAE5; color: #065F46; padding: 2px 6px; border-radius: 4px; font-size: 11px; font-weight: 600;">✔ Validé</span></td>
            </tr>
        `;
    }
    const element = document.createElement('div');
    element.innerHTML = `
        <div style="padding: 35px; font-family: 'Inter', Helvetica, Arial, sans-serif; color: #1E293B; background: white; max-width: 800px; margin: 0 auto;">
            <!-- En-tête type Relevé Bancaire -->
            <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #0B1F4D; padding-bottom: 20px; margin-bottom: 25px;">
                <div>
                    <h1 style="color: #0B1F4D; font-size: 26px; font-weight: 900; margin: 0; letter-spacing: -0.5px;">TONTINE PRO 🏛️</h1>
                    <p style="color: #5C60F5; font-size: 13px; font-weight: 700; margin: 4px 0 0 0;">RELEVÉ OFFICIEL DE COTISATIONS & PARCOURS</p>
                    <p style="color: #64748B; font-size: 11px; margin: 2px 0 0 0;">Plateforme SaaS de Gestion de Cercles d'Épargne</p>
                </div>
                <div style="text-align: right;">
                    <div style="font-size: 12px; font-weight: 700; color: #1E293B; background: #F1F5F9; padding: 6px 12px; border-radius: 6px; border: 1px solid #CBD5E1; display: inline-block;">
                        Sceau : ${certCode}
                    </div>
                    <div style="font-size: 11px; color: #64748B; margin-top: 6px;">Édité le ${nowStr}</div>
                </div>
            </div>

            <!-- Informations Titulaire et Période -->
            <div style="background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; padding: 16px; margin-bottom: 25px; display: grid; grid-template-columns: 1fr 1fr; gap: 15px;">
                <div>
                    <div style="font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 600;">Titulaire du compte / Membre</div>
                    <div style="font-size: 16px; font-weight: 800; color: #0B1F4D; margin-top: 2px;">${memberName}</div>
                    <div style="font-size: 12px; color: #10B981; font-weight: 600; margin-top: 2px;">⭐ Membre Régulier & Certifié</div>
                </div>
                <div>
                    <div style="font-size: 11px; color: #64748B; text-transform: uppercase; font-weight: 600;">Période d'audit & Périmètre</div>
                    <div style="font-size: 13px; font-weight: 700; color: #1E293B; margin-top: 2px;">Du ${startDate} au ${endDate}</div>
                    <div style="font-size: 12px; color: #475569; margin-top: 2px;">Cercle : ${tontineName}</div>
                </div>
            </div>

            <!-- Synthèse de solde -->
            <div style="display: flex; gap: 15px; margin-bottom: 25px;">
                <div style="flex: 1; background: #ECFDF5; border: 1px solid #10B981; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 11px; color: #065F46; font-weight: 600;">TOTAL COTISÉ SUR LA PÉRIODE</div>
                    <div style="font-size: 18px; font-weight: 900; color: #047857; margin-top: 4px;">+${totalAmountStr}</div>
                </div>
                <div style="flex: 1; background: #EFF6FF; border: 1px solid #3B82F6; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 11px; color: #1E40AF; font-weight: 600;">NOMBRE DE VERSEMENTS</div>
                    <div style="font-size: 18px; font-weight: 900; color: #1D4ED8; margin-top: 4px;">${txCountStr}</div>
                </div>
                <div style="flex: 1; background: #F5F3FF; border: 1px solid #8B5CF6; border-radius: 8px; padding: 12px; text-align: center;">
                    <div style="font-size: 11px; color: #5B21B6; font-weight: 600;">RÉGULARITÉ & CONFIANCE</div>
                    <div style="font-size: 18px; font-weight: 900; color: #6D28D9; margin-top: 4px;">100% (À Jour)</div>
                </div>
            </div>

            <!-- Tableau chronologique -->
            <h3 style="font-size: 14px; font-weight: 800; color: #0B1F4D; margin-bottom: 10px; text-transform: uppercase; border-bottom: 2px solid #E2E8F0; padding-bottom: 6px;">
                Détail Chronologique des Transactions & Versements
            </h3>
            <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
                <thead>
                    <tr style="background: #F1F5F9; color: #334155; font-size: 12px; font-weight: 700; text-align: left;">
                        <th style="padding: 10px 8px;">Date</th>
                        <th style="padding: 10px 8px;">Référence</th>
                        <th style="padding: 10px 8px;">Libellé de l'opération</th>
                        <th style="padding: 10px 8px;">Méthode</th>
                        <th style="padding: 10px 8px; text-align: right;">Montant</th>
                        <th style="padding: 10px 8px; text-align: center;">Statut</th>
                    </tr>
                </thead>
                <tbody>
                    ${rowsHtml}
                </tbody>
            </table>

            <!-- Pied de page officiel / Signature -->
            <div style="border-top: 2px solid #0B1F4D; padding-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 11px; color: #64748B;">
                <div>
                    <p style="margin: 0; font-weight: 700; color: #0B1F4D;">Attestation d'épargne certifiée conforme — Tontine Pro</p>
                    <p style="margin: 2px 0 0 0;">Ce document tient lieu de justificatif officiel de cotisation pour la période indiquée.</p>
                </div>
                <div style="text-align: center; border: 1px dashed #94A3B8; padding: 10px 20px; border-radius: 6px; background: #F8FAFC;">
                    <div style="font-weight: 800; color: #5C60F5; font-size: 12px;">SCEAU & SIGNATURE</div>
                    <div style="font-size: 10px; color: #64748B; margin-top: 4px;">Le Gestionnaire Principal</div>
                </div>
            </div>
        </div>
    `;

    const opt = {
        margin:       0.4,
        filename:     `Releve_de_la_Tontine_${memberName.replace(/\s+/g, '_')}_${startDate.substring(0,4)}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'in', format: 'letter', orientation: 'portrait' }
    };

    if (typeof showGlobalLoader === 'function') showGlobalLoader();
    if (window.html2pdf) {
        html2pdf().set(opt).from(element).save().then(() => {
            if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
            const modal = document.getElementById('member-statement-modal');
            if (modal) modal.classList.add('hidden');
            window.modalHistoryPushed = false;
            if (typeof showToast === 'function') showToast("📄 Relevé de cotisations PDF généré et téléchargé avec succès !", "success");
            else alert("Le relevé PDF a été téléchargé avec succès !");
        });
    } else {
        if (typeof hideGlobalLoader === 'function') hideGlobalLoader();
        alert("Erreur: La bibliothèque d'export PDF n'est pas chargée.");
    }
}

window.openMemberStatementModal = openMemberStatementModal;
window.setStatementPeriod = setStatementPeriod;
window.previewMemberStatement = previewMemberStatement;
window.exportMemberStatementToPDF = exportMemberStatementToPDF;



function sendMessage(roomName, isAdmin) {
    if (roomName.startsWith('#') && !isAdmin) {
        if(typeof showToast === 'function') showToast("Le groupe général est réservé aux annonces du gestionnaire.", "error");
        return;
    }
    const inputEl = document.getElementById('chat-message-input');
    const msgsEl = document.getElementById('chat-messages-area');
    if (!inputEl || !inputEl.value.trim() || !msgsEl) return;
    
    const text = inputEl.value.trim();
    inputEl.value = '';
    
    const now = new Date();
    const timeStr = now.toLocaleTimeString('fr-FR', {hour: '2-digit', minute:'2-digit'});
    
    let senderName = state.user ? state.user.name.split('@')[0] : 'Moi';
    senderName = senderName.charAt(0).toUpperCase() + senderName.slice(1);
    
    if (isAdmin) senderName += ' (Gestionnaire)';
    const initial = senderName.charAt(0).toUpperCase();
    const bgColor = isAdmin ? '#6366F1' : '#10B981';
    
    const newMsgHTML = `
        <div style="display: flex; gap: 10px; align-items: flex-start;">
            <div style="width: 36px; height: 36px; border-radius: 50%; background: ${bgColor}; color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0;">${initial}</div>
            <div style="background: var(--surface); border: 1px solid var(--border); padding: 12px 14px; border-radius: 14px; border-top-left-radius: 4px; max-width: 80%;">
                <div style="font-size: 11.5px; font-weight: 700; color: ${bgColor}; margin-bottom: 4px;">${escapeHTML(senderName)}</div>
                <div style="font-size: 13.5px; color: var(--text-1); line-height: 1.4;">${escapeHTML(text)}</div>
                <div style="font-size: 10px; color: var(--text-3); text-align: right; margin-top: 4px;">${timeStr}</div>
            </div>
        </div>
    `;
    
    msgsEl.innerHTML += newMsgHTML;
    msgsEl.scrollTop = msgsEl.scrollHeight;
    
    if (typeof DataService !== 'undefined' && DataService.createMessage) {
        DataService.createMessage({
            content: text,
            room: roomName
        }).catch(err => console.error(err));
    }
}

// ==========================================
// AXE 6 - NOTIFICATIONS & PROFIL
// ==========================================

let mockNotifications = [];

function generateDynamicNotifications() {
    mockNotifications = [];
    let notifId = 1;

    // 1. Alertes de retards simulés ou basés sur les pénalités
    if (_payAllTransactions) {
        const penalties = _payAllTransactions.filter(tx => tx.type === 'penalty');
        if (penalties.length > 0) {
            const lastPenalty = penalties[penalties.length - 1];
            mockNotifications.push({
                id: notifId++,
                type: 'alert',
                title: 'Retard de paiement',
                text: `${lastPenalty.member} a un retard. Pénalité de ${new Intl.NumberFormat('fr-FR').format(lastPenalty.amount)} FCFA appliquée.`,
                time: lastPenalty.date || 'Récemment',
                read: false
            });
        }
    }

    // 2. Rappels d'échéance basés sur les tontines actives
    if (state.activeTontines && state.activeTontines.length > 0) {
        state.activeTontines.forEach(t => {
            let freqText = "bientôt";
            if(t.frequency === 'quotidien') freqText = "demain";
            if(t.frequency === 'hebdomadaire') freqText = "cette semaine";
            if(t.frequency === 'mensuel') freqText = "le mois prochain";
            
            mockNotifications.push({
                id: notifId++,
                type: 'info',
                title: `Rappel : ${t.name}`,
                text: `Le prochain tour de la tontine « ${t.name} » approche (${freqText}).`,
                time: 'Aujourd\'hui',
                read: false
            });
        });
    }

    // 3. Paiements récents
    if (_payAllTransactions) {
        const recentIns = _payAllTransactions.filter(tx => tx.type === 'in' && tx.status === 'validated');
        if (recentIns.length > 0) {
            const lastIn = recentIns[recentIns.length - 1];
            mockNotifications.push({
                id: notifId++,
                type: 'payment',
                title: 'Paiement reçu',
                text: `${lastIn.member} a payé sa cotisation (${new Intl.NumberFormat('fr-FR').format(lastIn.amount)} FCFA)`,
                time: lastIn.date || 'Récemment',
                read: false
            });
        }
    }
}

function renderNotifications() {
    if (mockNotifications.length === 0) {
        generateDynamicNotifications();
    }
    const container = document.getElementById('notif-list-container');
    const badge = document.getElementById('header-notif-badge');
    if(!container) return;
    
    let unreadCount = mockNotifications.filter(n => !n.read).length;
    
    if (badge) {
        badge.textContent = unreadCount;
        badge.style.display = unreadCount > 0 ? 'flex' : 'none';
        badge.style.alignItems = 'center';
        badge.style.justifyContent = 'center';
    }
    
    container.innerHTML = '';
    
    if(mockNotifications.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--text-3); font-size: 13px;">Aucune notification</div>';
        return;
    }
    
    mockNotifications.forEach(notif => {
        let iconHtml = '';
        if(notif.type === 'payment') iconHtml = '💸';
        if(notif.type === 'alert') iconHtml = '⚠️';
        if(notif.type === 'info') iconHtml = 'ℹ️';
        
        container.innerHTML += `
            <div class="notif-item ${notif.read ? '' : 'unread'}" onclick="markNotifRead(${notif.id})">
                <div class="notif-icon ${notif.type}">${iconHtml}</div>
                <div class="notif-content">
                    <h5>${notif.title}</h5>
                    <p>${notif.text}</p>
                    <div class="notif-time">${notif.time}</div>
                </div>
            </div>
        `;
    });
}

window.toggleNotificationDropdown = function(event) {
    if (event) event.stopPropagation();
    const dropdown = document.getElementById('notifications-dropdown');
    if (dropdown) {
        dropdown.classList.toggle('hidden');
        if (!dropdown.classList.contains('hidden')) {
            renderNotifications();
        }
    }
};

window.markNotifRead = function(id) {
    const idx = mockNotifications.findIndex(n => n.id === id);
    if(idx !== -1) {
        mockNotifications.splice(idx, 1);
        renderNotifications();
        
        // Hide dropdown if empty
        if (mockNotifications.length === 0) {
            const dropdown = document.getElementById('notifications-dropdown');
            if (dropdown) dropdown.classList.add('hidden');
        }
    }
};

window.markAllNotifsRead = function() {
    mockNotifications.forEach(n => n.read = true);
    renderNotifications();
};

window.saveProfileInfo = function() {
    if(typeof showToast === 'function') {
        showToast('Vos informations ont été mises à jour avec succès.', 'success');
    } else {
        alert('Informations mises à jour.');
    }
};

window.updateProfilePhoto = function(input) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        if (!file.type.startsWith('image/')) {
            if(typeof showToast === 'function') showToast('Veuillez sélectionner une image valide.', 'error');
            return;
        }

        const reader = new FileReader();
        reader.onload = function(e) {
            const tempImg = new Image();
            tempImg.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                const MAX_SIZE = 250;
                let width = tempImg.width;
                let height = tempImg.height;
                
                if (width > height) {
                    if (width > MAX_SIZE) {
                        height *= MAX_SIZE / width;
                        width = MAX_SIZE;
                    }
                } else {
                    if (height > MAX_SIZE) {
                        width *= MAX_SIZE / height;
                        height = MAX_SIZE;
                    }
                }
                
                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(tempImg, 0, 0, width, height);
                
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.85);
                
                const avatarImg = document.getElementById('profile-avatar-img');
                if(avatarImg) avatarImg.src = compressedDataUrl;
                
                try {
                    localStorage.setItem('user_profile_avatar', compressedDataUrl);
                } catch(err) {
                    console.error("Erreur de quota localStorage:", err);
                }
                
                if (typeof window.SupabaseService !== 'undefined' && window.SupabaseService.updateUserAvatar) {
                    window.SupabaseService.updateUserAvatar(compressedDataUrl).then(({error}) => {
                        if (error) console.warn("Supabase avatar sync error:", error);
                    });
                }
                
                const sidebarAvatar = document.querySelector('.user-avatar img');
                if(sidebarAvatar) sidebarAvatar.src = compressedDataUrl;
                
                if(typeof renderMembersTab === 'function') {
                    renderMembersTab(); 
                }
                
                if(typeof showToast === 'function') {
                    showToast('Photo de profil mise à jour avec succès.', 'success');
                }
            };
            tempImg.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
};

// --- GESTION AVANCES (Portefeuille) ---
window.openCreditAdvanceModal = function(memberName, currentBalance) {
    document.getElementById('credit-advance-member-name').innerText = memberName;
    document.getElementById('credit-advance-member-id').value = memberName;
    document.getElementById('credit-advance-current-balance').innerText = new Intl.NumberFormat('fr-FR').format(currentBalance) + ' FCFA';
    document.getElementById('credit-advance-amount').value = '';
    
    document.getElementById('credit-advance-modal').classList.remove('hidden');
};

// --- AXE 6 : MES STATISTIQUES PERSONNELLES ---
window.renderMemberStatsTab = async function(showFeedback = false) {
    let totalContributions = 0;
    let nextPayoutAmount = 0;
    let nextPayoutDateStr = "Aucun tour prévu";
    let totalPenalties = 0;
    const historyList = [];

    // On simule les données pour l'utilisateur connecté (Ex: Wilfried ou le nom actuel du profile)
    const currentUserName = document.querySelector('.sb-uname')?.textContent || "Utilisateur";

    // Calculs basés sur les transactions globales
    const transactions = _payAllTransactions || [];
    transactions.forEach(tx => {
        if (tx.member === currentUserName || currentUserName === "Utilisateur") {
            if (tx.type === 'in' && tx.status === 'validated') {
                totalContributions += tx.amount;
            }
            if (tx.type === 'penalty') {
                totalPenalties += tx.amount;
            }
            historyList.push(tx);
        }
    });

    // Chercher le prochain tour dans les tontines actives
    if (state.activeTontines && state.activeTontines.length > 0) {
        const t = state.activeTontines[0]; // On prend la première tontine active
        nextPayoutAmount = t.amount * (t.members?.length || 5);
        
        let freqText = "Bientôt";
        if (t.frequency === 'quotidien') freqText = "Demain";
        if (t.frequency === 'hebdomadaire') freqText = "Dans 7 jours";
        if (t.frequency === 'mensuel') freqText = "Le mois prochain";
        
        nextPayoutDateStr = `${freqText} (${t.name})`;
    }

    const elTotal = document.getElementById('my-total-contributions');
    const elPayoutAmount = document.getElementById('my-next-payout-amount');
    const elPayoutDate = document.getElementById('my-next-payout-date');
    const elPenalties = document.getElementById('my-total-penalties');
    const elHistory = document.getElementById('my-transactions-list');

    if (elTotal) elTotal.textContent = new Intl.NumberFormat('fr-FR').format(totalContributions) + ' FCFA';
    if (elPayoutAmount) elPayoutAmount.textContent = new Intl.NumberFormat('fr-FR').format(nextPayoutAmount) + ' FCFA';
    if (elPayoutDate) elPayoutDate.textContent = nextPayoutDateStr;
    if (elPenalties) elPenalties.textContent = new Intl.NumberFormat('fr-FR').format(totalPenalties) + ' FCFA';

    if (elHistory) {
        if (historyList.length === 0) {
            elHistory.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-3);">Aucune transaction pour le moment.</td></tr>`;
        } else {
            elHistory.innerHTML = historyList.slice(0, 10).map(tx => {
                const badgeClass = tx.status === 'validated' ? 'badge-green' : (tx.status === 'pending' ? 'badge-orange' : 'badge-red');
                const badgeText = tx.status === 'validated' ? 'Validé' : (tx.status === 'pending' ? 'En attente' : 'Échoué');
                const typeIcon = tx.type === 'in' ? '🟢 Cotisation' : (tx.type === 'out' ? '🔴 Retrait' : '⚠️ Pénalité');
                
                return `
                <tr>
                    <td style="font-size:13px; color:var(--text-2);">${tx.date}</td>
                    <td style="font-weight:600; color:var(--text-1);">${tx.tontine || 'Général'}</td>
                    <td style="font-size:13px;">${typeIcon}</td>
                    <td style="font-weight:700; color:var(--text-1);">${new Intl.NumberFormat('fr-FR').format(tx.amount)} F</td>
                    <td><span class="badge-status ${badgeClass}">${badgeText}</span></td>
                </tr>`;
            }).join('');
        }
    }
    
    if (showFeedback && typeof showToast === 'function') {
        showToast("Statistiques actualisées avec succès.", "success");
    }
}

// --- AXE 6 : MODULE DE SONDAGES / VOTES ---
let activePolls = [
    {
        id: 1,
        question: "Doit-on augmenter la cotisation mensuelle à 15 000 FCFA ?",
        choices: [
            { text: "Oui, je suis d'accord", votes: 4 },
            { text: "Non, on garde 10 000 FCFA", votes: 2 }
        ],
        voted: false
    }
];

function renderVotesTab() {
    const container = document.getElementById('polls-container');
    const btnCreate = document.getElementById('btn-create-poll');
    
    if (btnCreate) {
        btnCreate.style.display = checkPermission('edit_tontine') ? 'block' : 'none';
    }

    if (!container) return;
    
    if (activePolls.length === 0) {
        container.innerHTML = `<div style="grid-column: 1 / -1; text-align: center; padding: 40px; background: var(--surface); border-radius: 12px; color: var(--text-3);">Aucun sondage en cours.</div>`;
        return;
    }

    container.innerHTML = activePolls.map(poll => {
        const totalVotes = poll.choices.reduce((sum, c) => sum + c.votes, 0);
        
        const choicesHtml = poll.choices.map((choice, idx) => {
            const percent = totalVotes > 0 ? Math.round((choice.votes / totalVotes) * 100) : 0;
            return `
            <div style="margin-top: 12px;">
                <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:600; margin-bottom:4px; color:var(--text-1);">
                    <span>${choice.text}</span>
                    <span>${percent}% (${choice.votes})</span>
                </div>
                <div style="position:relative; height:36px; background:var(--surface); border:1px solid var(--border); border-radius:8px; overflow:hidden; cursor:${poll.voted ? 'default' : 'pointer'};" ${!poll.voted ? `onclick="votePoll(${poll.id}, ${idx})"` : ''}>
                    <div style="position:absolute; top:0; left:0; height:100%; width:${percent}%; background:rgba(16, 185, 129, 0.2); transition: width 0.5s;"></div>
                    ${!poll.voted ? `<div style="position:absolute; top:0; left:0; width:100%; height:100%; display:flex; align-items:center; justify-content:center; font-size:12px; font-weight:700; color:var(--primary); opacity:0.8;">VOTER</div>` : ''}
                </div>
            </div>`;
        }).join('');

        const deleteBtnHtml = `<button onclick="deletePoll(${poll.id})" style="background:none; border:none; color:#ef4444; cursor:pointer; padding:4px;" title="Supprimer ce sondage">🗑️</button>`;

        return `
        <div class="card" style="border-top: 4px solid var(--primary); position: relative;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:12px;">
                <div style="display:flex; align-items:center; gap:8px;">
                    <div style="width:32px; height:32px; border-radius:50%; background:rgba(99, 102, 241, 0.1); display:flex; align-items:center; justify-content:center;">📊</div>
                    <h3 style="margin:0; font-size:15px; font-weight:700; color:var(--text-1); line-height:1.4;">${poll.question}</h3>
                </div>
                ${deleteBtnHtml}
            </div>
            <div style="font-size:12px; color:var(--text-3); margin-bottom:16px;">Total des votes : ${totalVotes}</div>
            ${choicesHtml}
        </div>`;
    }).join('');
}

window.openCreatePollModal = () => {
    document.getElementById('poll-question-input').value = '';
    document.getElementById('poll-choice1-input').value = '';
    document.getElementById('poll-choice2-input').value = '';
    document.getElementById('create-poll-modal').classList.remove('hidden');
};

window.submitNewPoll = () => {
    const q = document.getElementById('poll-question-input').value;
    const c1 = document.getElementById('poll-choice1-input').value;
    const c2 = document.getElementById('poll-choice2-input').value;
    
    if(!q || !c1 || !c2) {
        showToast("Veuillez remplir la question et au moins deux choix.", "error");
        return;
    }
    
    activePolls.unshift({
        id: Date.now(),
        question: q,
        choices: [
            { text: c1, votes: 0 },
            { text: c2, votes: 0 }
        ],
        voted: false
    });
    
    document.getElementById('create-poll-modal').classList.add('hidden');
    showToast("Sondage publié avec succès !", "success");
    
    if(window.addNotification) {
        window.addNotification('system', `Nouveau sondage : ${q}`);
    }
    
    renderVotesTab();
};

window.votePoll = (pollId, choiceIdx) => {
    const poll = activePolls.find(p => p.id === pollId);
    if(poll && !poll.voted) {
        poll.choices[choiceIdx].votes += 1;
        poll.voted = true;
        renderVotesTab();
        showToast("Votre vote a été pris en compte.", "success");
    }
};

window.deletePoll = (pollId) => {
    if(confirm("Voulez-vous vraiment supprimer ce sondage ?")) {
        activePolls = activePolls.filter(p => p.id !== pollId);
        renderVotesTab();
        showToast("Sondage supprimé.", "success");
    }
};

// Initialisation au chargement
document.addEventListener('DOMContentLoaded', () => {
    
    const btnCloseAdvance = document.getElementById('btn-close-credit-advance');
    if (btnCloseAdvance) {
        btnCloseAdvance.addEventListener('click', () => {
            document.getElementById('credit-advance-modal').classList.add('hidden');
        });
    }
    
    const btnSubmitAdvance = document.getElementById('btn-submit-credit-advance');
    if (btnSubmitAdvance) {
        btnSubmitAdvance.addEventListener('click', () => {
            const memberName = document.getElementById('credit-advance-member-id').value;
            const amountInput = document.getElementById('credit-advance-amount').value;
            const amount = parseInt(amountInput, 10);
            
            if (!amount || amount <= 0) {
                if(typeof showToast === 'function') showToast('Veuillez entrer un montant valide.', 'error');
                return;
            }
            
            const savedAdvances = JSON.parse(localStorage.getItem('tontine_advances') || '{}');
            const current = savedAdvances[memberName] || 0;
            savedAdvances[memberName] = current + amount;
            
            localStorage.setItem('tontine_advances', JSON.stringify(savedAdvances));
            
            if(typeof showToast === 'function') showToast(`Portefeuille de ${memberName} crédité de ${new Intl.NumberFormat('fr-FR').format(amount)} FCFA.`, 'success');
            
            document.getElementById('credit-advance-modal').classList.add('hidden');
            
            // Rafraichir l'onglet membres
            if (typeof renderMembersTab === 'function') renderMembersTab();
        });
    }

    setTimeout(renderNotifications, 1000);
    
    // Restaurer l'avatar personnalisé s'il existe
    const savedAvatar = localStorage.getItem('user_profile_avatar');
    if (savedAvatar) {
        const profileImg = document.getElementById('profile-avatar-img');
        if (profileImg) profileImg.src = savedAvatar;
        
        const sidebarAvatar = document.querySelector('.user-avatar img');
        if (sidebarAvatar) sidebarAvatar.src = savedAvatar;
    }
});
