/* ==========================================
   Tontine Pro - Supabase Client Initialization
   ==========================================
   NOTE: Ce fichier utilise le CDN Supabase.
   Les clés sont injectées directement ici pour
   un projet HTML/CSS/JS vanilla (sans bundler).
   En production, utilisez un backend sécurisé
   pour protéger vos clés.
   ========================================== */

// ─── Supabase Configuration ───────────────────────────────────────────────────
// Ces valeurs proviennent de config.js
const SUPABASE_URL = (typeof window.ENV !== 'undefined' && window.ENV.NEXT_PUBLIC_SUPABASE_URL) ? window.ENV.NEXT_PUBLIC_SUPABASE_URL : 'https://supabase.co';
const SUPABASE_ANON_KEY = (typeof window.ENV !== 'undefined' && window.ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY) ? window.ENV.NEXT_PUBLIC_SUPABASE_ANON_KEY : 'sb_publishable_Y4wMfbd6vBFqEOFFlpdC9A_BbRpPF_H';

// ─── Client Instance ──────────────────────────────────────────────────────────
let supabaseClient = null;

function getSupabaseClient() {
    if (supabaseClient) return supabaseClient;

    if (typeof window.supabase === 'undefined') {
        console.error('[Supabase] Le CDN Supabase n\'est pas chargé.');
        return null;
    }

    try {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: false
            }
        });
        console.log('[Supabase] Client initialisé avec succès.');
    } catch (err) {
        console.error('[Supabase] Erreur initialisation:', err);
        return null;
    }

    return supabaseClient;
}

// ─── Connection Test ──────────────────────────────────────────────────────────
async function testSupabaseConnection() {
    const client = getSupabaseClient();
    if (!client) return false;

    try {
        const { data, error } = await client.auth.getSession();
        if (error) {
            console.warn('[Supabase] Connexion partielle:', error.message);
            return false;
        }
        console.log('[Supabase] Connexion etablie. Session:', data.session ? 'Authentifie' : 'Anonyme');
        return true;
    } catch (err) {
        console.error('[Supabase] Connexion impossible:', err);
        return false;
    }
}

async function getSession() {
    const client = getSupabaseClient();
    if (!client) return { data: { session: null }, error: new Error('Client non initialisé') };
    return await client.auth.getSession();
}

async function signOut() {
    const client = getSupabaseClient();
    if (!client) return { error: new Error('Client non initialisé') };
    return await client.auth.signOut();
}

function onAuthStateChange(callback) {
    const client = getSupabaseClient();
    if (!client) return null;
    return client.auth.onAuthStateChange(callback);
}

// ─── Data Helpers ─────────────────────────────────────────────────────────────

async function fetchTontinesFromDB() {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
        const { data, error } = await client
            .from('tontines')
            .select('*')
            .eq('status', 'En cours')
            .order('created_at', { ascending: false });
        if (error) { console.warn('[Supabase] Erreur tontines:', error.message); return null; }
        return data;
    } catch (err) { return null; }
}

async function fetchMembersFromDB() {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
        const { data, error } = await client
            .from('profiles')
            .select('*')
            .order('reliability_score', { ascending: false });
        if (error) { console.warn('[Supabase] Erreur membres:', error.message); return null; }
        return data;
    } catch (err) { return null; }
}

async function fetchDashboardStatsFromDB() {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
        const { data, error } = await client
            .from('dashboard_stats')
            .select('*')
            .limit(1)
            .single();
        if (error) { console.warn('[Supabase] Erreur stats:', error.message); return null; }
        return data;
    } catch (err) { return null; }
}

async function fetchTransactionsFromDB(limit = 10) {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
        // En SQL, on joint avec la table profiles pour avoir le nom et l'avatar
        const { data, error } = await client
            .from('payments')
            .select(`
                *,
                profiles (full_name, avatar_url)
            `)
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) { console.warn('[Supabase] Erreur transactions:', error.message); return null; }
        return data;
    } catch (err) { return null; }
}

async function fetchRecentMessagesFromDB() {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
        const { data, error } = await client
            .from('messages')
            .select(`
                *,
                conversations (name, type),
                profiles (full_name, avatar_url)
            `)
            .order('created_at', { ascending: false })
            .limit(10);
        if (error) { console.warn('[Supabase] Erreur messages:', error.message); return null; }
        return data;
    } catch (err) { return null; }
}

async function fetchNotificationsFromDB() {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
        const { data, error } = await client
            .from('notifications')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) { console.warn('[Supabase] Erreur notifications:', error.message); return null; }
        return data;
    } catch (err) { return null; }
}

// ─── Real-time Subscriptions ──────────────────────────────────────────────────

function subscribeToTransactions(callback) {
    const client = getSupabaseClient();
    if (!client) return null;

    const subscription = client
        .channel('transactions-realtime')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'transactions'
        }, (payload) => {
            console.log('[Supabase] Nouvelle transaction:', payload.new);
            if (typeof callback === 'function') callback(payload.new);
        })
        .subscribe();

    return subscription;
}

function unsubscribeChannel(subscription) {
    const client = getSupabaseClient();
    if (client && subscription) client.removeChannel(subscription);
}

// ─── Export Global ────────────────────────────────────────────────────────────
window.SupabaseService = {
    getClient: getSupabaseClient,
    testConnection: testSupabaseConnection,
    getSession: getSession,
    signOut: signOut,
    onAuthStateChange: onAuthStateChange,
    fetchTontines: fetchTontinesFromDB,
    fetchMembers: fetchMembersFromDB,
    fetchDashboardStats: fetchDashboardStatsFromDB,
    fetchTransactions: fetchTransactionsFromDB,
    fetchNotifications: fetchNotificationsFromDB,
    fetchRecentMessages: fetchRecentMessagesFromDB,
    subscribeToTransactions,
    unsubscribeChannel
};

// ─── Data Mutations (Write) ───────────────────────────────────────────────────

async function fetchPaymentsForReports() {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
        const { data, error } = await client
            .from('payments')
            .select('amount, status, payment_date, tontines(name)');
        if (error) { console.warn('[Supabase] Erreur fetchPaymentsForReports:', error.message); return null; }
        return data;
    } catch (err) { return null; }
}

async function getDefaultProfileId() {
    const client = getSupabaseClient();
    if (!client) return null;
    try {
        const { data, error } = await client.from('profiles').select('id').limit(1).single();
        return error ? null : data.id;
    } catch (e) { return null; }
}

async function ensureProfileExists(client, userId) {
    try {
        const { data, error } = await client.from('profiles').select('id').eq('id', userId).single();
        if (error && error.code === 'PGRST116') {
            // Profile doesn't exist, try to insert it
            const { data: userData } = await client.auth.getUser();
            const fullName = userData?.user?.user_metadata?.full_name || 'Utilisateur';
            await client.from('profiles').insert([{ id: userId, full_name: fullName }]);
        }
    } catch (e) {
        console.warn("Erreur vérification profil", e);
    }
}

async function insertTontine(tontineData) {
    const client = getSupabaseClient();
    if (!client) return { error: "Non connecté" };
    
    const { data: { session } } = await client.auth.getSession();
    if (!session) return { error: "Non authentifié" };
    
    const userId = session.user.id;
    await ensureProfileExists(client, userId);

    const payload = {
        name: tontineData.name,
        amount_per_cycle: tontineData.amount_per_cycle,
        frequency: tontineData.frequency,
        max_members: tontineData.max_members || 10,
        status: 'En cours',
        created_by: userId,
        start_date: new Date().toISOString()
    };

    try {
        const { data, error } = await client.from('tontines').insert([payload]).select();
        return { data, error };
    } catch (err) { return { error: err.message }; }
}

async function deleteTontine(tontineId) {
    const client = getSupabaseClient();
    if (!client) return { error: "Non connecté" };
    
    try {
        const { data, error } = await client.from('tontines').delete().eq('id', tontineId);
        return { data, error };
    } catch (err) { return { error: err.message }; }
}

async function updateTontine(tontineId, payload) {
    const client = getSupabaseClient();
    if (!client) return { error: "Non connecté" };
    
    try {
        const { data, error } = await client.from('tontines').update(payload).eq('id', tontineId).select();
        return { data, error };
    } catch (err) { return { error: err.message }; }
}

async function insertMember(memberData) {
    const client = getSupabaseClient();
    if (!client) return { error: "Non connecté" };
    
    // Fallback uuid generator simple si crypto.randomUUID n'est pas dispo
    const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'id-' + Date.now();
    const payload = {
        id: id,
        full_name: memberData.name,
        phone: memberData.phone,
        email: memberData.email || null,
        is_active: memberData.status === 'Actif',
        reliability_score: 100,
        total_contributed: 0
    };

    try {
        const { data, error } = await client.from('profiles').insert([payload]).select();
        return { data, error };
    } catch (err) { return { error: err.message }; }
}

async function insertMessage(messageData) {
    const client = getSupabaseClient();
    if (!client) return { error: "Non connecté" };
    
    const { data: { session } } = await client.auth.getSession();
    if (!session) return { error: "Non authentifié" };
    
    const userId = session.user.id;

    let conversationId = messageData.conversation_id;
    if (!conversationId) {
        const { data: convData } = await client.from('conversations').select('id').limit(1).single();
        if (convData) {
            conversationId = convData.id;
        } else {
            // Créons une conversation temporaire pour débloquer
            const { data: newConv, error: convError } = await client.from('conversations').insert([{ name: 'Général', type: 'group' }]).select().single();
            if (newConv) {
                conversationId = newConv.id;
            } else {
                console.error("Erreur création conversation:", convError);
                return { error: "Impossible de créer la conversation. Détail: " + (convError ? convError.message : "Erreur inconnue") };
            }
        }
    }

    const payload = {
        conversation_id: conversationId,
        sender_id: userId,
        content: messageData.content
    };

    try {
        const { data, error } = await client.from('messages').insert([payload]).select();
        return { data, error };
    } catch (err) { return { error: err.message }; }
}

async function insertPayment(paymentData) {
    const client = getSupabaseClient();
    if (!client) return { error: "Non connecté" };

    // In a real app, you'd match the active round of a tontine.
    // For this mockup, we'll assign it to the first active tontine.
    let tontineId = null;
    try {
        const { data: tData } = await client.from('tontines').select('id').eq('status', 'En cours').limit(1).single();
        if (tData) tontineId = tData.id;
        else return { error: "Aucune tontine active trouvée" };
    } catch (e) { return { error: "Erreur lecture tontine" }; }

    const payload = {
        tontine_id: paymentData.tontine_id || tontineId,
        payer_id: paymentData.member_id,
        amount: paymentData.amount,
        payment_method: paymentData.payment_method || 'mobile_money',
        status: paymentData.status || 'valide',
        payment_type: paymentData.payment_type || 'cotisation'
    };

    try {
        const { data, error } = await client.from('payments').insert([payload]).select();
        return { data, error };
    } catch (err) { return { error: err.message }; }
}

window.SupabaseService.insertTontine = insertTontine;
window.SupabaseService.updateTontine = updateTontine;
window.SupabaseService.deleteTontine = deleteTontine;
window.SupabaseService.insertMember = insertMember;
window.SupabaseService.insertMessage = insertMessage;
window.SupabaseService.insertPayment = insertPayment;
window.SupabaseService.fetchPaymentsForReports = fetchPaymentsForReports;
