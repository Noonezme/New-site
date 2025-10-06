// Remove these lines from the top of app.js:
// import { initializeApp } from "https://www.gstatic.com/firebasejs/12.3.0/firebase-app.js";
// etc...

// Use the global firebase object instead
const firebaseConfig = {
    apiKey: "AIzaSyDKl95SU8HsH2WuG7nGngesT1eBXBSuUcA",
    authDomain: "chatapp-48849.firebaseapp.com",
    databaseURL: "https://chatapp-48849-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "chatapp-48849",
    storageBucket: "chatapp-48849.firebasestorage.app",
    messagingSenderId: "50270417905",
    appId: "1:50270417905:web:e5193cfb1b91caf4178a50",
    measurementId: "G-S8ND1H5CWK"
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const database = firebase.database();
const auth = firebase.auth();

// The rest of your app.js code remains the same...
// [Keep all the DOM elements, functions, and event listeners from the previous app.js]

// DOM elements
const elements = {
    userCount: document.getElementById('user-count'),
    usersList: document.getElementById('users-list'),
    allUsersList: document.getElementById('all-users-list'),
    chatMessages: document.getElementById('chat-messages'),
    messageInput: document.getElementById('message-input'),
    sendButton: document.getElementById('send-btn'),
    notification: document.getElementById('notification'),
    loginModal: document.getElementById('login-modal'),
    loginEmail: document.getElementById('login-email'),
    loginPassword: document.getElementById('login-password'),
    loginButton: document.getElementById('login-btn'),
    logoutButton: document.getElementById('logout-btn'),
    chatTitle: document.getElementById('chat-title'),
    messageInputContainer: document.getElementById('message-input-container'),
    adminPanel: document.getElementById('admin-panel'),
    newUserEmail: document.getElementById('new-user-email'),
    newUserPassword: document.getElementById('new-user-password'),
    newUserName: document.getElementById('new-user-name'),
    addUserButton: document.getElementById('add-user-btn'),
    currentUser: document.getElementById('current-user'),
    contextMenu: document.getElementById('context-menu'),
    contextPrivateMessage: document.getElementById('context-private-message')
};

// App state
let currentUser = null;
let currentUserData = null;
let users = {};
let registeredUsers = {};
let selectedPrivateUser = null;
let isAdmin = false;
let contextMenuTarget = null;

const ADMIN_UID = "uPTgtjHksOWmvtBFcHmpPGkKaFr2";

function init() {
    console.log('Initializing app...');
    setupEventListeners();
    setupContextMenu();
    
    onAuthStateChanged(auth, (user) => {
        console.log('Auth state changed:', user);
        if (user) {
            currentUser = user;
            console.log('User signed in:', user.uid);
            showNotification('Login successful!');
            
            // Initialize user data and listeners
            initializeUserSession(user);
        } else {
            console.log('User signed out');
            currentUser = null;
            elements.loginModal.style.display = 'flex';
            elements.messageInputContainer.style.display = 'none';
            elements.adminPanel.style.display = 'none';
        }
    });
}

function initializeUserSession(user) {
    // First, add user to registeredUsers if they don't exist
    const userRef = ref(database, `chat/registeredUsers/${user.uid}`);
    
    get(userRef).then((snapshot) => {
        if (!snapshot.exists()) {
            // User not in registeredUsers, add them
            console.log('Adding user to registeredUsers');
            return set(userRef, {
                username: user.email.split('@')[0],
                email: user.email,
                isAdmin: user.uid === ADMIN_UID,
                created: Date.now()
            });
        }
        return snapshot.val();
    }).then((userData) => {
        if (userData) {
            currentUserData = userData;
            isAdmin = userData.isAdmin || false;
            
            // Update UI
            elements.loginModal.style.display = 'none';
            elements.messageInputContainer.style.display = 'block';
            if (isAdmin) {
                elements.adminPanel.style.display = 'block';
            }
            
            updateCurrentUserDisplay(user);
            addCurrentUserToOnline();
            setupFirebaseListeners();
            
            console.log('User session initialized successfully');
        }
    }).catch((error) => {
        console.error('Error initializing user session:', error);
        showNotification('Error initializing session', true);
    });
}

function setupEventListeners() {
    elements.loginButton.addEventListener('click', handleLogin);
    elements.loginPassword.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleLogin();
    });
    elements.logoutButton.addEventListener('click', handleLogout);
    elements.sendButton.addEventListener('click', sendMessage);
    elements.messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    elements.addUserButton.addEventListener('click', addUser);

    // Close context menu when clicking elsewhere
    document.addEventListener('click', () => {
        elements.contextMenu.style.display = 'none';
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('context-active');
        });
    });
}

function setupContextMenu() {
    // Right-click context menu for users
    document.addEventListener('contextmenu', (e) => {
        const userItem = e.target.closest('.user-item');
        if (userItem && userItem.dataset.uid !== currentUser?.uid) {
            e.preventDefault();
            contextMenuTarget = userItem.dataset.uid;
            
            // Highlight the user item
            document.querySelectorAll('.user-item').forEach(item => {
                item.classList.remove('context-active');
            });
            userItem.classList.add('context-active');
            
            // Position and show context menu
            elements.contextMenu.style.display = 'block';
            elements.contextMenu.style.left = `${e.pageX}px`;
            elements.contextMenu.style.top = `${e.pageY}px`;
        }
    });

    // Context menu actions
    elements.contextPrivateMessage.addEventListener('click', () => {
        if (contextMenuTarget) {
            startPrivateChat(contextMenuTarget);
            elements.contextMenu.style.display = 'none';
        }
    });
}

function startPrivateChat(targetUid) {
    selectedPrivateUser = targetUid;
    const targetUser = users[targetUid] || registeredUsers[targetUid];
    if (targetUser) {
        elements.chatTitle.innerHTML = `<i>🔒</i> Private Chat with ${targetUser.username}`;
        // Clear current messages and load private conversation
        loadPrivateConversation(targetUid);
    }
}

function loadPrivateConversation(targetUid) {
    elements.chatMessages.innerHTML = '';
    
    // Load existing private messages between these users
    const privateMessagesRef = ref(database, 'chat/messages/private');
    get(privateMessagesRef).then((snapshot) => {
        const messages = snapshot.val() || {};
        const conversationMessages = Object.values(messages).filter(msg => 
            (msg.senderUid === currentUser.uid && msg.recipient === targetUid) ||
            (msg.senderUid === targetUid && msg.recipient === currentUser.uid)
        ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        conversationMessages.forEach(message => {
            addMessageToChat(message, 'private');
        });
        
        if (conversationMessages.length === 0) {
            addSystemMessage('Start a private conversation with ' + (users[targetUid]?.username || registeredUsers[targetUid]?.username));
        }
    }).catch((error) => {
        console.error('Error loading private conversation:', error);
        addSystemMessage('Error loading conversation');
    });
}

function addSystemMessage(text) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message other';
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-sender">System</span>
            <span class="message-time">Just now</span>
        </div>
        <div class="message-text">${text}</div>
    `;
    elements.chatMessages.appendChild(messageElement);
}

function updateCurrentUserDisplay(user) {
    if (elements.currentUser) {
        const displayName = currentUserData?.username || user.email.split('@')[0];
        elements.currentUser.innerHTML = `
            <div class="user-avatar">${displayName.charAt(0).toUpperCase()}</div>
            <div>
                <div style="font-weight: 600;">${displayName}</div>
                <div style="font-size: 0.8rem; opacity: 0.8;">${isAdmin ? 'Administrator' : 'User'}</div>
            </div>
        `;
    }
}

function handleLogin() {
    const email = elements.loginEmail.value.trim();
    const password = elements.loginPassword.value;
    
    if (!email || !password) {
        showNotification('Please enter both email and password', true);
        return;
    }
    
    console.log('Attempting login with:', email);
    
    signInWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            console.log('Login successful');
        })
        .catch((error) => {
            console.error('Login error:', error);
            let errorMessage = 'Login failed';
            
            switch (error.code) {
                case 'auth/invalid-email':
                    errorMessage = 'Invalid email address';
                    break;
                case 'auth/user-disabled':
                    errorMessage = 'This account has been disabled';
                    break;
                case 'auth/user-not-found':
                    errorMessage = 'No account found with this email';
                    break;
                case 'auth/wrong-password':
                    errorMessage = 'Incorrect password';
                    break;
                default:
                    errorMessage = error.message;
            }
            
            showNotification(errorMessage, true);
        });
}

function handleLogout() {
    if (currentUser) {
        const onlineUserRef = ref(database, `chat/onlineUsers/${currentUser.uid}`);
        set(onlineUserRef, null).catch(error => {
            console.error('Error removing from online users:', error);
        });
        
        signOut(auth).then(() => {
            showNotification('Logged out successfully');
        }).catch((error) => {
            console.error('Logout error:', error);
        });
    }
}

function setupFirebaseListeners() {
    console.log('Setting up Firebase listeners...');
    
    // Online users listener
    const onlineUsersRef = ref(database, 'chat/onlineUsers');
    onValue(onlineUsersRef, (snapshot) => {
        users = snapshot.val() || {};
        console.log('Online users updated:', users);
        updateUserList();
    }, (error) => {
        console.error('Online users listener error:', error);
    });
    
    // Registered users listener
    const registeredUsersRef = ref(database, 'chat/registeredUsers');
    onValue(registeredUsersRef, (snapshot) => {
        registeredUsers = snapshot.val() || {};
        console.log('Registered users updated:', registeredUsers);
        updateAllUsersList();
    }, (error) => {
        console.error('Registered users listener error:', error);
    });
    
    // Public messages listener
    const publicMessagesRef = ref(database, 'chat/messages/public');
    onValue(publicMessagesRef, (snapshot) => {
        if (!selectedPrivateUser) {
            elements.chatMessages.innerHTML = '';
            const messages = snapshot.val() || {};
            console.log('Public messages updated:', messages);
            Object.values(messages).forEach(message => {
                addMessageToChat(message, 'public');
            });
        }
    }, (error) => {
        console.error('Public messages listener error:', error);
    });
    
    // Private messages listener
    const privateMessagesRef = ref(database, 'chat/messages/private');
    onValue(privateMessagesRef, (snapshot) => {
        const messages = snapshot.val() || {};
        console.log('Private messages updated:', messages);
        Object.values(messages).forEach(message => {
            if (message.recipient === currentUser.uid || message.senderUid === currentUser.uid) {
                if (!document.querySelector(`[data-message-id="${message.id}"]`)) {
                    // If we're in a private chat with this user, show the message
                    if (selectedPrivateUser && 
                        ((message.senderUid === currentUser.uid && message.recipient === selectedPrivateUser) ||
                         (message.senderUid === selectedPrivateUser && message.recipient === currentUser.uid))) {
                        addMessageToChat(message, 'private');
                    }
                    
                    // Show notification for new private messages
                    if (message.recipient === currentUser.uid && message.senderUid !== currentUser.uid) {
                        showChatNotification(message);
                    }
                }
            }
        });
    }, (error) => {
        console.error('Private messages listener error:', error);
    });
}

function addCurrentUserToOnline() {
    if (currentUser && currentUserData) {
        const onlineUserRef = ref(database, `chat/onlineUsers/${currentUser.uid}`);
        set(onlineUserRef, {
            username: currentUserData.username,
            uid: currentUser.uid,
            lastActive: Date.now(),
            online: true
        }).then(() => {
            console.log('Added user to online users');
        }).catch((error) => {
            console.error('Error adding to online users:', error);
        });
        
        // Update activity every 30 seconds
        setInterval(() => {
            if (currentUser) {
                update(ref(database, `chat/onlineUsers/${currentUser.uid}`), {
                    lastActive: Date.now()
                }).catch(error => {
                    console.error('Error updating user activity:', error);
                });
            }
        }, 30000);
    }
}

function addUser() {
    const email = elements.newUserEmail.value.trim();
    const password = elements.newUserPassword.value;
    const username = elements.newUserName.value.trim();
    
    if (!email || !password || !username) {
        showNotification('Please fill all fields', true);
        return;
    }
    
    createUserWithEmailAndPassword(auth, email, password)
        .then((userCredential) => {
            const user = userCredential.user;
            const userRef = ref(database, `chat/registeredUsers/${user.uid}`);
            return set(userRef, {
                username: username,
                email: email,
                isAdmin: false,
                created: Date.now()
            });
        })
        .then(() => {
            elements.newUserEmail.value = '';
            elements.newUserPassword.value = '';
            elements.newUserName.value = '';
            showNotification(`User "${username}" created successfully`);
        })
        .catch((error) => {
            console.error('Error creating user:', error);
            showNotification(`Error creating user: ${error.message}`, true);
        });
}

function updateUserList() {
    const onlineUsers = Object.keys(users).filter(uid => users[uid].online && uid !== currentUser?.uid);
    elements.userCount.textContent = onlineUsers.length;
    
    // Remove inactive users
    const now = Date.now();
    Object.keys(users).forEach(uid => {
        if (now - users[uid].lastActive > 60000) {
            update(ref(database, `chat/onlineUsers/${uid}`), { online: false }).catch(error => {
                console.error('Error updating user status:', error);
            });
        }
    });
    
    elements.usersList.innerHTML = '';
    onlineUsers.forEach(uid => {
        createUserListItem(elements.usersList, users[uid], uid);
    });
}

function updateAllUsersList() {
    elements.allUsersList.innerHTML = '';
    
    Object.keys(registeredUsers).forEach(uid => {
        if (uid !== currentUser?.uid) {
            const userData = registeredUsers[uid];
            const isOnline = users[uid]?.online || false;
            createUserListItem(elements.allUsersList, { ...userData, online: isOnline }, uid);
        }
    });
}

function createUserListItem(container, user, uid) {
    const userElement = document.createElement('div');
    userElement.className = 'user-item';
    userElement.dataset.uid = uid;
    
    userElement.innerHTML = `
        <div class="user-avatar-small" style="background: ${user.online ? '#28a745' : '#6c757d'}">
            ${user.username?.charAt(0).toUpperCase() || '?'}
        </div>
        <div class="user-details">
            <div class="user-name">${user.username || 'Unknown User'}</div>
            <div class="user-status">
                <div class="status-indicator ${user.online ? '' : 'offline'}"></div>
                ${user.online ? 'Online' : 'Offline'}
            </div>
        </div>
    `;
    
    container.appendChild(userElement);
}

function sendMessage() {
    const messageText = elements.messageInput.value.trim();
    if (!messageText) return;
    
    const message = {
        id: Date.now().toString(),
        sender: currentUserData.username,
        senderUid: currentUser.uid,
        text: messageText,
        timestamp: new Date().toISOString()
    };
    
    let messageRef;
    
    if (selectedPrivateUser) {
        // Send private message
        message.recipient = selectedPrivateUser;
        message.recipientName = users[selectedPrivateUser]?.username || registeredUsers[selectedPrivateUser]?.username;
        messageRef = ref(database, 'chat/messages/private');
    } else {
        // Send public message
        messageRef = ref(database, 'chat/messages/public');
    }
    
    push(messageRef, message).then(() => {
        console.log('Message sent successfully');
        elements.messageInput.value = '';
        elements.messageInput.focus();
    }).catch((error) => {
        console.error('Error sending message:', error);
        showNotification('Error sending message: ' + error.message, true);
    });
}

function addMessageToChat(message, type) {
    const messageElement = document.createElement('div');
    const isOwnMessage = message.senderUid === currentUser.uid;
    
    messageElement.className = `message ${isOwnMessage ? 'own' : 'other'} ${type === 'private' ? 'private' : ''}`;
    messageElement.setAttribute('data-message-id', message.id);
    
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-sender">${message.sender}</span>
            ${type === 'private' ? '<span class="private-badge">Private</span>' : ''}
            <span class="message-time">${formatTimestamp(message.timestamp)}</span>
        </div>
        <div class="message-text">${message.text}</div>
    `;
    
    elements.chatMessages.appendChild(messageElement);
    elements.chatMessages.scrollTop = elements.chatMessages.scrollHeight;
}

function showChatNotification(message) {
    // Optional: Implement desktop notifications
    if (Notification.permission === 'granted') {
        new Notification(`Private message from ${message.sender}`, {
            body: message.text,
            icon: '/favicon.ico'
        });
    }
}

function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function showNotification(message, isError = false) {
    elements.notification.textContent = message;
    elements.notification.className = `notification ${isError ? 'error' : ''}`;
    elements.notification.classList.add('show');
    setTimeout(() => {
        elements.notification.classList.remove('show');
    }, 3000);
}

// Request notification permission
if ('Notification' in window) {
    Notification.requestPermission();
}

// Initialize the app
window.addEventListener('DOMContentLoaded', init);
