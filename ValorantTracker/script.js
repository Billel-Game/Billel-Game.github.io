// Initialize Supabase Client
const SUPABASE_URL = 'https://rqtmirtcubjznmjvvgdu.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxdG1pcnRjdWJqem5tanZ2Z2R1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Njg2NTgxOTAsImV4cCI6MjA4NDIzNDE5MH0.qIj64wpiUREBMS0wtzcVF5NMI5-iKl7Vt4b8NkhdDAI';
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Auth state
let currentUser = null;

// Check auth state on load
checkAuth();

async function checkAuth() {
    const { data: { session } } = await db.auth.getSession();
    
    if (session?.user) {
        currentUser = session.user;
        showApp();
    } else {
        showAuth();
    }
}

// Show/Hide screens
function showAuth() {
    document.getElementById('authScreen').style.display = 'flex';
    document.getElementById('appScreen').style.display = 'none';
}

function showApp() {
    document.getElementById('authScreen').style.display = 'none';
    document.getElementById('appScreen').style.display = 'block';
    initApp();
}

// Auth functions
function showLogin() {
    document.getElementById('loginForm').style.display = 'block';
    document.getElementById('signupForm').style.display = 'none';
    document.querySelectorAll('.auth-tab')[0].classList.add('active');
    document.querySelectorAll('.auth-tab')[1].classList.remove('active');
}

function showSignup() {
    document.getElementById('loginForm').style.display = 'none';
    document.getElementById('signupForm').style.display = 'block';
    document.querySelectorAll('.auth-tab')[0].classList.remove('active');
    document.querySelectorAll('.auth-tab')[1].classList.add('active');
}

// Login
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('loginEmail').value;
    const password = document.getElementById('loginPassword').value;
    const messageEl = document.getElementById('loginMessage');
    
    messageEl.textContent = 'Signing in...';
    messageEl.style.color = '#8b949e';
    
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    
    if (error) {
        console.error('Login error:', error);
        messageEl.textContent = '❌ ' + error.message;
        messageEl.style.color = '#da3633';
    } else {
        console.log('Login success:', data);
        currentUser = data.user;
        showApp();
    }
});

// Signup
document.getElementById('signupForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('signupEmail').value;
    const password = document.getElementById('signupPassword').value;
    const messageEl = document.getElementById('signupMessage');
    
    messageEl.textContent = 'Creating account...';
    messageEl.style.color = '#8b949e';
    
    const { data, error } = await db.auth.signUp({ 
        email, 
        password,
        options: {
            emailRedirectTo: window.location.origin
        }
    });
    
    if (error) {
        messageEl.textContent = '❌ ' + error.message;
        messageEl.style.color = '#da3633';
    } else {
        messageEl.textContent = '✅ Success! Check your email to verify your account before logging in.';
        messageEl.style.color = '#238636';
        // Clear form
        document.getElementById('signupEmail').value = '';
        document.getElementById('signupPassword').value = '';
    }
});

// Logout
async function logout() {
    await db.auth.signOut();
    currentUser = null;
    accounts = [];
    showAuth();
}

// Initialize app after auth
function initApp() {
    loadAccounts();
}
// Get elements
const accountForm = document.getElementById('accountForm');
const accountsList = document.getElementById('accountsList');
const accountCount = document.getElementById('accountCount');
const btnText = document.getElementById('btnText');
const btnLoader = document.getElementById('btnLoader');

// Load accounts from localStorage
let accounts = [];
let apiKey = 'HDEV-c5968dec-ce49-43fa-b945-ab007cf333f8';

// Optionally show API key in input if you want to display it (not required anymore)
if (document.getElementById('apiKeyInput')) {
    document.getElementById('apiKeyInput').value = apiKey;
}

// Load accounts from Supabase
async function loadAccounts() {
    const { data, error } = await db
        .from('accounts')
        .select('*')
        .order('date_added', { ascending: false });
    
    if (error) {
        console.error('Error loading accounts:', error);
        showNotification('Error loading accounts', 'error');
        return;
    }
    
    accounts = data.map(acc => ({
        id: acc.id,
        username: acc.username,
        gameName: acc.game_name,
        tagLine: acc.tag_line,
        region: acc.region,
        loginUsername: acc.login_username,
        loginPassword: acc.login_password,
        rank: acc.rank,
        peakRank: acc.peak_rank,
        accountLevel: acc.account_level,
        dateAdded: new Date(acc.date_added).toLocaleDateString(),
        lastUpdated: new Date(acc.last_updated).toLocaleString()
    }));
    
    displayAccounts();
}

// Save API key
// saveApiKey is now unnecessary since the key is hardcoded
function saveApiKey() {
    showNotification('API key is now set automatically.');
}

// Auto-fetch form submit
accountForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const gameName = document.getElementById('gameName').value.trim();
    const tagLine = document.getElementById('tagLine').value.trim();
    const region = document.getElementById('region').value;
    const loginUsername = document.getElementById('loginUsername').value.trim();
    const loginPassword = document.getElementById('loginPassword').value.trim();
    
    btnText.style.display = 'none';
    btnLoader.style.display = 'block';
    accountForm.querySelector('button').disabled = true;
    
    try {
        let rank = 'Unranked';
        let peakRank = null;
        let accountLevel = null;
        
        try {
            const rankData = await fetchRank(gameName, tagLine, region);
            rank = rankData.currentRank;
            peakRank = rankData.peakRank;
            accountLevel = rankData.accountLevel;
        } catch (error) {
            console.error('Rank fetch error:', error);
        }
        
        const newAccount = {
            username: gameName + '#' + tagLine,
            game_name: gameName,
            tag_line: tagLine,
            region: region,
            login_username: loginUsername,
            login_password: loginPassword,
            rank: rank,
            peak_rank: peakRank,
            account_level: accountLevel
        };
        
        const { data, error } = await db
            .from('accounts')
            .insert([newAccount])
            .select();
        
        console.log('Insert result:', { data, error });
        
        if (error) {
            throw new Error(error.message);
        }
        
        await loadAccounts();
        accountForm.reset();
        showNotification('Account added successfully!');
        
    } catch (error) {
        showNotification('Error: ' + error.message, 'error');
    } finally {
        btnText.style.display = 'block';
        btnLoader.style.display = 'none';
        accountForm.querySelector('button').disabled = false;
    }
});

// Save accounts to localStorage
function saveAccounts() {
    localStorage.setItem('valorantAccounts', JSON.stringify(accounts));
}

// Fetch rank using Henrik API with auth
async function fetchRank(gameName, tagLine, region) {
    try {
        const headers = { 'Authorization': apiKey };
        
        const apiUrl = 'https://api.henrikdev.xyz/valorant/v2/mmr/' + region + '/' + encodeURIComponent(gameName) + '/' + encodeURIComponent(tagLine);
        
        const response = await fetch(apiUrl, { headers: headers });
        const data = await response.json();
        
        console.log('API Response for ' + gameName + '#' + tagLine + ':', data);
        
        if (data.status === 200 && data.data) {
            let currentRank = 'Unranked';
            let peakRank = null;
            let accountLevel = null;
            
            console.log('Full data object:', JSON.stringify(data.data, null, 2));
            
            // Get current rank if available
            if (data.data.current_data && data.data.current_data.currenttierpatched) {
                currentRank = data.data.current_data.currenttierpatched;
            }
            
            // Get account level
            if (data.data.account_level) {
                accountLevel = data.data.account_level;
            }
            
            // Get peak rank - check multiple possible locations
            if (data.data.highest_rank && data.data.highest_rank.patched_tier) {
                peakRank = data.data.highest_rank.patched_tier;
                console.log('Peak found in highest_rank.patched_tier:', peakRank);
            } else if (data.data.peak_rank && data.data.peak_rank.patched_tier) {
                peakRank = data.data.peak_rank.patched_tier;
                console.log('Peak found in peak_rank.patched_tier:', peakRank);
            } else {
                console.log('No peak rank found. Available keys:', Object.keys(data.data));
                console.log('highest_rank:', data.data.highest_rank);
                console.log('peak_rank:', data.data.peak_rank);
            }
            
            console.log('Parsed data:', { currentRank: currentRank, peakRank: peakRank, accountLevel: accountLevel });
            
            return { currentRank: currentRank, peakRank: peakRank, accountLevel: accountLevel };
        }
        
        if (data.errors) {
            console.error('API Error:', data.errors);
        }
        
        return { currentRank: 'Unranked', peakRank: null, accountLevel: null };
        
    } catch (error) {
        console.error('Fetch Error:', error);
        return { currentRank: 'Unranked', peakRank: null, accountLevel: null };
    }
}

// Refresh single account
async function refreshSingleAccount(id) {
    const account = accounts.find(acc => acc.id === id);
    if (!account) return;
    
    showNotification('Refreshing ' + account.username + '...');
    
    try {
        const rankData = await fetchRank(account.gameName, account.tagLine, account.region);
        
        const { error } = await db
            .from('accounts')
            .update({
                rank: rankData.currentRank,
                peak_rank: rankData.peakRank,
                account_level: rankData.accountLevel,
                last_updated: new Date().toISOString()
            })
            .eq('id', id);
        
        if (error) throw new Error(error.message);
        
        await loadAccounts();
        showNotification(account.username + ' updated!');
    } catch (error) {
        console.error('Failed to update ' + account.username + ':', error);
        showNotification('Failed to update ' + account.username, 'error');
    }
}

// Refresh all ranks
async function refreshAllRanks() {
    showNotification('Refreshing all ranks (10 per minute limit)...');
    
    let count = 0;
    for (let account of accounts) {
        if (!account.manual && account.game_name && account.tag_line) {
            try {
                const rankData = await fetchRank(account.game_name, account.tag_line, account.region);
                
                // Update in Supabase
                await supabase
                    .from('accounts')
                    .update({
                        rank: rankData.currentRank,
                        peak_rank: rankData.peakRank,
                        account_level: rankData.accountLevel,
                        last_updated: new Date().toISOString()
                    })
                    .eq('id', account.id);
                
                // Update local copy
                account.rank = rankData.currentRank;
                account.account_level = rankData.accountLevel;
                account.peak_rank = rankData.peakRank;
                account.last_updated = new Date().toISOString();
                count++;
                
                // Pause every 10 requests to avoid rate limit
                if (count % 10 === 0) {
                    showNotification('Rate limit reached, waiting 60 seconds...', 'warning');
                    await new Promise(resolve => setTimeout(resolve, 61000));
                }
            } catch (error) {
                console.error('Failed to update ' + account.username + ':', error);
            }
        }
    }
    
    displayAccounts();
    showNotification('All ranks updated!');
}

// Get rank color class
function getRankClass(rank) {
    if (!rank) return 'rank-unranked';
    const rankLower = rank.toLowerCase();
    if (rankLower.includes('iron')) return 'rank-iron';
    if (rankLower.includes('bronze')) return 'rank-bronze';
    if (rankLower.includes('silver')) return 'rank-silver';
    if (rankLower.includes('gold')) return 'rank-gold';
    if (rankLower.includes('platinum')) return 'rank-platinum';
    if (rankLower.includes('diamond')) return 'rank-diamond';
    if (rankLower.includes('ascendant')) return 'rank-ascendant';
    if (rankLower.includes('immortal')) return 'rank-immortal';
    if (rankLower.includes('radiant')) return 'rank-radiant';
    return 'rank-unranked';
}

// Display all accounts
function displayAccounts() {
    accountCount.textContent = accounts.length;
    
    if (accounts.length === 0) {
        accountsList.innerHTML = '<div class="empty-state"><p>No accounts added yet. Add your first account above!</p></div>';
        return;
    }
    
    // Group accounts by region
    const accountsByRegion = {};
    accounts.forEach(account => {
        const region = account.region || 'unknown';
        if (!accountsByRegion[region]) {
            accountsByRegion[region] = [];
        }
        accountsByRegion[region].push(account);
    });
    
    // Define region order (EU first, then alphabetically)
    const regionOrder = ['eu', 'na', 'ap', 'kr', 'latam', 'br', 'unknown'];
    const sortedRegions = Object.keys(accountsByRegion).sort((a, b) => {
        const aIndex = regionOrder.indexOf(a);
        const bIndex = regionOrder.indexOf(b);
        if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
        if (aIndex === -1) return 1;
        if (bIndex === -1) return -1;
        return aIndex - bIndex;
    });
    
    // Build HTML with region sections (collapsible)
    let html = '';
    sortedRegions.forEach(region => {
        const regionAccounts = accountsByRegion[region];
        const regionNames = {
            'eu': 'Europe',
            'na': 'North America',
            'ap': 'Asia Pacific',
            'kr': 'Korea',
            'latam': 'Latin America',
            'br': 'Brazil',
            'unknown': 'Unknown Region'
        };

        html += '<details class="region-section" open>';
        html += '<summary class="region-title">' + regionNames[region] + ' (' + regionAccounts.length + ')</summary>';
        html += '<div class="accounts-grid">';

        regionAccounts.forEach(account => {
            html += '<div class="account-card">';
            html += '<div class="account-header">';
            html += '<h3>' + account.username + '</h3>';
            if (account.accountLevel) {
                html += '<span class="account-level">' + account.accountLevel + '</span>';
            }
            html += '</div>';

            if (account.loginUsername) {
                html += '<div class="account-info">';
                html += '<span class="info-label">Username: </span>';
                html += '<span class="info-value">' + account.loginUsername + '</span>';
                html += '</div>';
            }

            if (account.loginPassword) {
                html += '<div class="account-info password-row">';
                html += '<span class="info-label">Password: </span>';
                html += '<span class="password-display">';
                html += '<span class="password-hidden" id="pass-' + account.id + '">••••••••</span>';
                html += '<span class="password-shown" id="pass-show-' + account.id + '" style="display: none;">' + account.loginPassword + '</span>';
                html += '</span>';
                html += '<button class="btn-toggle-password" onclick="togglePassword(' + account.id + ')" id="btn-' + account.id + '">';
                html += '<svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
                html += '</button>';
                html += '</div>';
            }

            html += '<div class="account-info">';
            html += '<span class="info-label">Rank:</span>';
            html += '<span class="rank-badge ' + getRankClass(account.rank) + '">' + account.rank + '</span>';
            html += '</div>';

            if (account.peakRank) {
                html += '<div class="account-info">';
                html += '<span class="info-label">Peak:</span>';
                html += '<span class="rank-badge peak-badge ' + getRankClass(account.peakRank) + '">' + account.peakRank + '</span>';
                html += '</div>';
            }

            if (!account.manual && account.gameName && account.tagLine) {
                html += '<button class="btn-refresh-single" onclick="refreshSingleAccount(' + account.id + ')">Refresh Rank</button>';
            }
            html += '<button class="btn-delete" onclick="deleteAccount(' + account.id + ')">Delete Account</button>';
            html += '</div>';
        });

        html += '</div></details>';
    });
    
    accountsList.innerHTML = html;
}

// Toggle password visibility
function togglePassword(id) {
    const hidden = document.getElementById('pass-' + id);
    const shown = document.getElementById('pass-show-' + id);
    const btn = document.getElementById('btn-' + id);
    
    if (hidden.style.display === 'none') {
        hidden.style.display = 'inline';
        shown.style.display = 'none';
        btn.innerHTML = '<svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>';
    } else {
        hidden.style.display = 'none';
        shown.style.display = 'inline';
        btn.innerHTML = '<svg class="eye-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path><line x1="1" y1="1" x2="23" y2="23"></line></svg>';
    }
}

// Delete account
async function deleteAccount(id) {
    if (confirm('Are you sure you want to delete this account?')) {
        const { error } = await supabase
            .from('accounts')
            .delete()
            .eq('id', id);
        
        if (error) {
            showNotification('Error deleting account', 'error');
            return;
        }
        
        await loadAccounts();
        showNotification('Account deleted successfully!');
    }
}

// Export accounts to JSON file
function exportAccounts() {
    if (accounts.length === 0) {
        showNotification('No accounts to export!', 'warning');
        return;
    }
    
    const dataStr = JSON.stringify({ accounts: accounts, apiKey: apiKey }, null, 2);
    const dataBlob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(dataBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'valorant-accounts-' + new Date().toISOString().split('T')[0] + '.json';
    link.click();
    URL.revokeObjectURL(url);
    showNotification('Accounts exported successfully!');
}

// Import accounts from JSON file
async function importAccounts(event) {
    const file = event.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const data = JSON.parse(e.target.result);
            
            if (data.accounts && Array.isArray(data.accounts)) {
                if (confirm('This will merge with existing accounts. Continue?')) {
                    // Get existing usernames from database
                    const existingUsernames = new Set(accounts.map(acc => acc.username));
                    let importedCount = 0;
                    
                    // Insert each new account into Supabase
                    for (const acc of data.accounts) {
                        if (!existingUsernames.has(acc.username)) {
                            const newAccount = {
                                username: acc.username,
                                game_name: acc.gameName,
                                tag_line: acc.tagLine,
                                region: acc.region,
                                login_username: acc.loginUsername,
                                login_password: acc.loginPassword,
                                rank: acc.rank,
                                peak_rank: acc.peakRank,
                                account_level: acc.accountLevel
                            };
                            
                            const { error } = await db
                                .from('accounts')
                                .insert([newAccount]);
                            
                            if (!error) {
                                importedCount++;
                            } else {
                                console.error('Error importing account:', error);
                            }
                        }
                    }
                    
                    // Import API key if exists
                    // Ignore imported apiKey, always use the default
                    
                    await loadAccounts();
                    showNotification('Imported ' + importedCount + ' new accounts!');
                }
            } else {
                showNotification('Invalid file format!', 'error');
            }
        } catch (error) {
            showNotification('Error reading file: ' + error.message, 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // Reset file input
}

// Show notification
function showNotification(message, type) {
    type = type || 'success';
    const colors = {
        success: '#ff4655',
        warning: '#ff9800',
        error: '#f44336'
    };
    
    const notification = document.createElement('div');
    notification.style.cssText = 'position: fixed; top: 20px; right: 20px; background: ' + colors[type] + '; color: white; padding: 15px 25px; border-radius: 5px; font-weight: bold; z-index: 1000; animation: slideIn 0.3s ease;';
    notification.textContent = message;
    document.body.appendChild(notification);
    
    setTimeout(function() {
        notification.remove();
    }, 3000);
}

// Add CSS animation
const style = document.createElement('style');
style.textContent = '@keyframes slideIn { from { transform: translateX(400px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }';
document.head.appendChild(style);

