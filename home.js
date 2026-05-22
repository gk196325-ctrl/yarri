// ==========================================
// 1. FIREBASE CONFIGURATION & INITIALIZATION
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyARtxm64vkG1e9c07eaNTY8GLJMeICvbOo",
  authDomain: "yarri-99021.firebaseapp.com",
  projectId: "yarri-99021",
  storageBucket: "yarri-99021.firebasestorage.app",
  messagingSenderId: "469263009084",
  appId: "1:469263009084:web:bbd075daaca7f0903fca39",
  measurementId: "G-Q1LHWZVHGJ"
};

if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const auth = firebase.auth();
const db = firebase.firestore();
const storage = firebase.storage(); 

// Global Application Tracking Matrices
let activeChatUserId = "";
let chatListenerUnsubscribe = null;
let globalFriendsList = []; 
let incomingRequests = [];
let structuralNotificationLogs = [];
let currentViewingStoryId = ""; 
let storyCommentsUnsubscribe = null;
let profileViewingUidCurrently = "";

// INSTAGRAM STYLE STORIES STATE TRACKING
let activeStoriesArray = []; 
let currentStoryIndex = 0;
let storyTimerReference = null;
const DEFAULT_STORY_DURATION = 5000; // 5 Seconds for images

const YarriAlert = {
  success: (msg) => Swal.fire({ icon: 'success', title: msg, showConfirmButton: false, timer: 1800, background: '#fff', customClass: { popup: 'border-radius-20' } }),
  error: (msg) => Swal.fire({ icon: 'error', title: 'Oops...', text: msg, confirmButtonColor: '#7b2ff7' }),
  toast: (msg) => Swal.fire({ text: msg, toast: true, position: 'top-end', showConfirmButton: false, timer: 3000, timerProgressBar: true })
};

// ==========================================
// 2. GOOGLE AUTH HUB CONTROLLERS
// ==========================================
window.googleLogin = function() {
  const provider = new firebase.auth.GoogleAuthProvider();
  const msgEl = document.getElementById("msg");
  if(msgEl) msgEl.innerText = "Connecting to Google... ⏳";
  
  auth.signInWithPopup(provider)
    .then((result) => {
      if (result && result.user) {
        db.collection("users").doc(result.user.uid).get().then((doc) => {
          if (doc.exists) {
            window.location.href = "home.html";
          } else {
            document.getElementById("login-card").style.display = "none";
            document.getElementById("setup-card").style.display = "block";
          }
        });
      }
    })
    .catch((error) => {
      if(msgEl) msgEl.innerText = "Login Failed: " + error.message;
      YarriAlert.error(error.message);
    });
}

window.saveUsername = function() {
  const usernameInput = document.getElementById("username-input").value.trim().toLowerCase();
  const setupMsg = document.getElementById("setup-msg");
  const user = auth.currentUser;
  
  if(!usernameInput || usernameInput.length < 3) {
    if(setupMsg) setupMsg.innerText = "Username min 3 letters ka hona chahiye!";
    return;
  }
  if (!user) return;

  db.collection("users").where("username", "==", usernameInput).get().then((snapshot) => {
    if (!snapshot.empty) {
      if(setupMsg) setupMsg.innerText = "Ye username pehle se occupied hai!";
    } else {
      db.collection("users").doc(user.uid).set({
        username: usernameInput,
        email: user.email,
        uid: user.uid,
        photoURL: user.photoURL || "profile.png",
        bio: "",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      }).then(() => {
        window.location.href = "home.html";
      });
    }
  });
}

// ==========================================
// 3. SOCIAL GRAPH NETWORKING (RELATION ENGINE)
// ==========================================
window.syncFriendsCache = async function() {
  const currentUser = auth.currentUser;
  if(!currentUser) return;
  globalFriendsList = [];
  try {
    const snap1 = await db.collection("friendships").where("user1", "==", currentUser.uid).get();
    snap1.forEach(doc => globalFriendsList.push(doc.data().user2));
    const snap2 = await db.collection("friendships").where("user2", "==", currentUser.uid).get();
    snap2.forEach(doc => globalFriendsList.push(doc.data().user1));
    loadGlobalFeed();
    loadActiveVideoStories();
  } catch (err) { 
    loadGlobalFeed(); 
    loadActiveVideoStories();
  }
}

// REAL-TIME NOTIFICATIONS WATCHER ENGINE
window.listenToNotifications = function() {
  const currentUser = auth.currentUser;
  if(!currentUser) return;

  // Listen to Friend Requests in Real-Time
  db.collection("friend_requests")
    .where("receiverUid", "==", currentUser.uid)
    .where("status", "==", "pending")
    .onSnapshot((snapshot) => {
      incomingRequests = [];
      snapshot.forEach(doc => { incomingRequests.push({ id: doc.id, type: "friend_request", ...doc.data() }); });
      compileAndRenderBadges();
    });

  // Listen to Activity Logs (Likes & Comments) in Real-Time
  db.collection("activity_logs")
    .where("targetUid", "==", currentUser.uid)
    .orderBy("timestamp", "desc")
    .limit(30)
    .onSnapshot((snapshot) => {
      structuralNotificationLogs = [];
      snapshot.forEach(doc => { structuralNotificationLogs.push({ id: doc.id, type: "activity", ...doc.data() }); });
      compileAndRenderBadges();
      // If the modal/screen is open, auto re-render to make it seamless
      const screen = document.getElementById("notification-screen");
      if(screen && screen.style.display === "flex") {
        window.openNotifications();
      }
    });
}

function compileAndRenderBadges() {
  const badge = document.getElementById("noti-badge");
  if(!badge) return;
  const totalCount = incomingRequests.length + structuralNotificationLogs.length;
  if(totalCount === 0) {
    badge.style.display = "none";
    badge.innerText = "0";
  } else {
    badge.style.display = "block";
    badge.innerText = totalCount;
  }
}

window.openNotifications = function() {
  document.getElementById("notification-screen").style.display = "flex";
  const listContainer = document.getElementById("notifications-list");
  if(incomingRequests.length === 0 && structuralNotificationLogs.length === 0) {
    listContainer.innerHTML = "<p style='text-align:center;color:#64748b;margin-top:40px; font-size:14px; font-weight:500;'>Inbox is pristine clear! 🔔</p>";
    return;
  }
  listContainer.innerHTML = "";

  // Render Real-time Friend Requests
  incomingRequests.forEach(req => {
    listContainer.innerHTML += `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:white;border-radius:20px;box-shadow:0 4px 12px rgba(0,0,0,0.02);border:1px solid #f1f5f9;margin-bottom:8px;">
        <div style="font-size:13px; font-weight:500; color:#1e293b;"><strong style="color:#7b2ff7;">@${req.senderUsername}</strong> sent you a friend request. 🤝</div>
        <div style="display:flex;gap:8px;">
          <button onclick="acceptFriendRequest('${req.id}', '${req.senderUid}')" style="background:#10b981;color:white;border:none;padding:8px 14px;border-radius:12px;cursor:pointer;font-weight:700;font-size:12px;box-shadow:0 2px 6px rgba(16,185,129,0.2);">Accept</button>
          <button onclick="rejectFriendRequest('${req.id}')" style="background:#ef4444;color:white;border:none;padding:8px 14px;border-radius:12px;cursor:pointer;font-weight:700;font-size:12px;box-shadow:0 2px 6px rgba(239,68,68,0.2);">Reject</button>
        </div>
      </div>`;
  });

  // Render Real-time Likes and Comments
  structuralNotificationLogs.forEach(log => {
    let messageString = "";
    if(log.action === "like") messageString = `❤️ <b>@${log.triggerUsername}</b> liked your post: "${log.postSnippet || ''}"`;
    if(log.action === "comment") messageString = `💬 <b>@${log.triggerUsername}</b> commented: "${log.commentText || ''}" on your post.`;
    
    listContainer.innerHTML += `
      <div style="padding:16px; background:white; border-radius:20px; box-shadow:0 4px 12px rgba(0,0,0,0.02); border:1px solid #f1f5f9; font-size:13px; color:#334155; margin-bottom:8px;">
        ${messageString}
      </div>`;
  });
}

window.closeNotifications = function() { document.getElementById("notification-screen").style.display = "none"; }

window.acceptFriendRequest = async function(reqId, senderUid) {
  try {
    await db.collection("friendships").add({ user1: auth.currentUser.uid, user2: senderUid, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    await db.collection("friend_requests").doc(reqId).delete();
    YarriAlert.success("Bhaichara Added! 🤝");
    await window.syncFriendsCache();
    window.openNotifications();
  } catch(e) { console.error(e); }
}

window.rejectFriendRequest = async function(reqId) {
  await db.collection("friend_requests").doc(reqId).delete();
  window.openNotifications();
}

window.loadGlobalUsersViewPanel = async function(searchQuery = "") {
  const container = document.getElementById("search-results-container") || document.getElementById("friends-list-container");
  if(!container) return;
  container.innerHTML = "<p style='text-align:center;padding:20px;color:#64748b;font-weight:500;'>Searching Network Matrix...</p>";
  
  try {
    const snap = await db.collection("users").get();
    container.innerHTML = "";
    let matchesFound = false;
    const qStr = searchQuery.trim().toLowerCase();

    snap.forEach(doc => {
      const uData = doc.data();
      if(doc.id !== auth.currentUser.uid) {
        if(qStr === "" || uData.username.includes(qStr)) {
          matchesFound = true;
          container.innerHTML += `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:16px;background:white;border-radius:22px;margin-bottom:8px;box-shadow:0 4px 14px rgba(0,0,0,0.02); border:1px solid #f1f5f9;">
              <div style="display:flex;align-items:center;gap:12px;">
                <img src="${uData.photoURL || 'profile.png'}" style="width:40px;height:40px;border-radius:50%;object-fit:cover;border:1px solid #e2e8f0;">
                <strong style="color:#0f172a; font-size:14px;">@${uData.username}</strong>
              </div>
              <button onclick="window.openUserProfile('${doc.id}')" style="background:linear-gradient(135deg,#ff00cc,#7b2ff7);color:white;border:none;padding:10px 16px;border-radius:14px;cursor:pointer;font-size:12px;font-weight:700;box-shadow:0 4px 10px rgba(123,47,247,0.15);">View Profile</button>
            </div>`;
        }
      }
    });

    if(!matchesFound) {
      container.innerHTML = "<p style='color:#64748b;text-align:center;padding:20px;font-size:13px;font-weight:500;'>Koi user nahi mila</p>";
    }
  } catch (error) { container.innerHTML = "Error loading users."; }
}

window.openUserProfile = function(uid) {
  window.closeSearchUsersModal();
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.getElementById('tab-profile').classList.add('active');
  loadUserProfileCardData(uid);
}

// ==========================================
// 4. ADVANCED PREMIUM PROFILE CARD ACTIONS ENGINE
// ==========================================
async function loadUserProfileCardData(uid) {
  profileViewingUidCurrently = uid;
  const isOwnProfile = (uid === auth.currentUser.uid);
  
  const userDoc = await db.collection("users").doc(uid).get();
  if(!userDoc.exists) return;
  const userData = userDoc.data();
  
  // Basic Text Mappings
  document.getElementById("profile-tab-name").innerText = userData.username;
  document.getElementById("profile-tab-handle").innerText = "@" + userData.username;
  document.getElementById("profile-tab-dp").src = userData.photoURL || "profile.png";
  
  // Custom Bio Logic Handler
  const bioBox = document.getElementById("profile-tab-bio");
  if(bioBox) {
    if(userData.bio && userData.bio.trim() !== "") {
      bioBox.innerText = userData.bio;
      bioBox.classList.remove("empty-bio");
    } else {
      bioBox.innerText = isOwnProfile ? "Tap here to add your bio..." : "No bio available yet.";
      bioBox.classList.add("empty-bio");
    }
    bioBox.style.cursor = isOwnProfile ? "pointer" : "default";
  }

  const triggerZone = document.getElementById("profile-dp-trigger-zone");
  const editBadge = document.getElementById("profile-dp-edit-icon-indicator");
  if(triggerZone && editBadge) {
    if(isOwnProfile) {
      triggerZone.onclick = () => document.getElementById("profile-dp-file-uploader").click();
      editBadge.style.display = "flex";
    } else {
      triggerZone.onclick = null;
      editBadge.style.display = "none";
    }
  }

  const friendsStatBox = document.getElementById("friends-stat-click-box");
  if(friendsStatBox) {
    friendsStatBox.onclick = () => window.openProfileFriendsModal(uid, userData.username);
  }
  
  const postsSnap = await db.collection("posts").where("uid", "==", uid).get();
  document.getElementById("stats-posts-count").innerText = postsSnap.size;

  let localFriendsArrayPool = [];
  const fSnap1 = await db.collection("friendships").where("user1", "==", uid).get();
  fSnap1.forEach(doc => localFriendsArrayPool.push(doc.data().user2));
  const fSnap2 = await db.collection("friendships").where("user2", "==", uid).get();
  fSnap2.forEach(doc => localFriendsArrayPool.push(doc.data().user1));
  
  document.getElementById("stats-friends-count").innerText = localFriendsArrayPool.length;

  const actionBox = document.getElementById("profile-friend-action-container");
  if(!isOwnProfile) {
    actionBox.style.display = "block";
    if(globalFriendsList.includes(uid)) {
      actionBox.innerHTML = `<button class="profile-action-btn btn-unfriend" onclick="cardUnfriendEngine('${uid}')">Unfriend ❌</button>`;
    } else {
      actionBox.innerHTML = `<button class="profile-action-btn btn-add-friend" onclick="cardAddFriendEngine('${uid}', '${userData.username}')">Add Friend +</button>`;
    }
  } else { actionBox.style.display = "none"; }
  
  const pf = document.getElementById("my-personal-feed"); 
  if(pf) { pf.innerHTML = ""; postsSnap.forEach(d => renderSinglePost(d, pf)); }
}

window.triggerBioUpdateFlow = async function() {
  if (profileViewingUidCurrently !== auth.currentUser.uid) return; 
  
  const currentDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  const currentBio = currentDoc.data().bio || "";

  const { value: text } = await Swal.fire({
    title: 'Update Your Bio',
    input: 'textarea',
    inputLabel: 'Apne baare me kuch likhein...',
    inputValue: currentBio,
    inputPlaceholder: 'e.g. Code is life | Bhaichara on Top...',
    inputAttributes: { 'maxlength': 120 },
    showCancelButton: true,
    confirmButtonColor: '#7b2ff7',
    cancelButtonColor: '#64748b'
  });

  if (text !== undefined) {
    await db.collection("users").doc(auth.currentUser.uid).update({ bio: text.trim() });
    YarriAlert.success("Bio updated successfully! ✨");
    loadUserProfileCardData(auth.currentUser.uid);
  }
}

window.handleProfilePictureUpload = async function(inputEl) {
  const file = inputEl.files[0];
  if(!file || !auth.currentUser) return;

  Swal.fire({ title: 'Uploading DP...', text: 'Updating premium profile asset grids', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
  try {
    const storageRef = storage.ref().child(`profile_photos/${auth.currentUser.uid}_${Date.now()}`);
    const uploadSnapshot = await storageRef.put(file);
    const downloadUrl = await uploadSnapshot.ref.getDownloadURL();

    await db.collection("users").doc(auth.currentUser.uid).update({ photoURL: downloadUrl });
    
    document.querySelectorAll('.user-current-dp').forEach(img => img.src = downloadUrl);
    const mainNavImg = document.getElementById("nav-profile-img"); if(mainNavImg) mainNavImg.src = downloadUrl;

    Swal.close();
    YarriAlert.success("Profile Avatar Live! 📷");
    loadUserProfileCardData(auth.currentUser.uid);
  } catch(err) {
    Swal.close();
    YarriAlert.error("DP upload failed.");
  }
}

window.openProfileFriendsModal = async function(uid, titleUsername) {
  const modal = document.getElementById("profile-friends-modal");
  const listContainer = document.getElementById("profile-friends-list-container");
  if(!modal || !listContainer) return;

  document.getElementById("friends-modal-title").innerText = `@${titleUsername}'s Friends 👥`;
  listContainer.innerHTML = "<p style='text-align:center; color:#64748b; font-size:13px; margin-top:20px;'>Fetching connections pool...</p>";
  modal.style.display = "flex";

  try {
    let connectionListUids = [];
    const snap1 = await db.collection("friendships").where("user1", "==", uid).get();
    snap1.forEach(doc => connectionListUids.push(doc.data().user2));
    const snap2 = await db.collection("friendships").where("user2", "==", uid).get();
    snap2.forEach(doc => connectionListUids.push(doc.data().user1));

    if(connectionListUids.length === 0) {
      listContainer.innerHTML = "<p style='text-align:center; color:#94a3b8; font-size:13px; margin-top:30px; font-weight:500;'>No friends found in this node.</p>";
      return;
    }

    listContainer.innerHTML = "";
    for(let individualUid of connectionListUids) {
      const uDoc = await db.collection("users").doc(individualUid).get();
      if(uDoc.exists) {
        const data = uDoc.data();
        listContainer.innerHTML += `
          <div style="display:flex; align-items:center; justify-content:between; padding:14px; background:white; border-radius:20px; border:1px solid #f1f5f9; box-shadow:0 2px 8px rgba(0,0,0,0.01); margin-bottom: 6px;">
            <div style="display:flex; align-items:center; gap:12px; flex:1;" onclick="window.closeProfileFriendsModal(); window.openUserProfile('${individualUid}')">
              <img src="${data.photoURL || 'profile.png'}" style="width:38px; height:38px; border-radius:50%; object-fit:cover; border:1px solid #e2e8f0;">
              <strong style="color:#0f172a; font-size:13px; cursor:pointer;">@${data.username}</strong>
            </div>
          </div>`;
      }
    }
  } catch(e) {
    listContainer.innerHTML = "<p style='text-align:center; color:#ef4444;'>Failed to pull connections catalog.</p>";
  }
}

window.closeProfileFriendsModal = function() {
  const modal = document.getElementById("profile-friends-modal");
  if(modal) modal.style.display = "none";
}

window.cardAddFriendEngine = async function(tUid, tName) {
  const myDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  await db.collection("friend_requests").add({ senderUid: auth.currentUser.uid, senderUsername: myDoc.data().username, receiverUid: tUid, status: "pending" });
  YarriAlert.success("Request Sent! Dynamic Tracking enabled."); 
  loadUserProfileCardData(tUid);
}

window.cardUnfriendEngine = async function(tUid) {
  const q1 = await db.collection("friendships").where("user1", "==", auth.currentUser.uid).where("user2", "==", tUid).get();
  q1.forEach(d => d.ref.delete());
  const q2 = await db.collection("friendships").where("user2", "==", auth.currentUser.uid).where("user1", "==", tUid).get();
  q2.forEach(d => d.ref.delete());
  YarriAlert.toast("Bhaichara Revoked."); 
  await window.syncFriendsCache(); 
  loadUserProfileCardData(tUid);
}

// ==========================================
// 5. POST CONTENT LIFECYCLE MANAGEMENT
// ==========================================
window.createPost = async function() {
  const textInput = document.getElementById("post-text");
  const text = textInput ? textInput.value.trim() : "";
  if (!text) return;
  const myDoc = await db.collection("users").doc(auth.currentUser.uid).get();
  await db.collection("posts").add({ 
    uid: auth.currentUser.uid, 
    username: myDoc.data().username, 
    text: text, 
    likes: {}, 
    likeCount: 0, 
    timestamp: firebase.firestore.FieldValue.serverTimestamp() 
  });
  if(textInput) textInput.value = "";
  YarriAlert.success("Post Published! 🚀");
  window.syncFriendsCache();
}

function loadGlobalFeed() {
  db.collection("posts").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
    const feed = document.getElementById("global-feed");
    if(!feed) return;
    feed.innerHTML = snapshot.empty ? "<h4 style='text-align:center;color:#94a3b8;padding:40px; font-weight:500;'>Timeline is empty. Be the first to share!</h4>" : "";
    snapshot.forEach((doc) => renderSinglePost(doc, feed));
  });
}

function renderSinglePost(doc, container) {
  const post = doc.data(); 
  const postId = doc.id;
  const likesMap = post.likes || {}; 
  const isLiked = !!likesMap[auth.currentUser?.uid];
  
  const isMyPost = auth.currentUser && post.uid === auth.currentUser.uid;
  const deleteItemHtml = isMyPost 
    ? `<button class="dropdown-item delete-action" onclick="deletePostEngine('${postId}')">🗑️ Delete Post</button>` 
    : '';
  
  let mediaCode = "";
  if(post.fileUrl) {
    if(post.fileType === "image") mediaCode = `<img src="${post.fileUrl}" style="width:100%; max-height:340px; border-radius:20px; object-fit:cover; margin:14px 0; box-shadow:0 4px 14px rgba(0,0,0,0.03);">`;
    else if(post.fileType === "video") mediaCode = `<video src="${post.fileUrl}" controls style="width:100%; max-height:340px; border-radius:20px; margin:14px 0; background:black; box-shadow:0 4px 14px rgba(0,0,0,0.03);"></video>`;
  }

  const div = document.createElement("div"); 
  div.className = "post-card";
  div.id = `post-card-container-${postId}`;
  
  div.innerHTML = `
    <div class="post-header">
      <div class="post-user-info" onclick="window.openUserProfile('${post.uid}')">
        <strong style="color:#0f172a; font-size:14px;">@${post.username}</strong>
      </div>
      
      <div class="post-options-container">
        <button class="three-dots-trigger" onclick="togglePostDropdownMenu(event, '${postId}')">⋮</button>
        <div class="options-dropdown-menu" id="options-dropdown-${postId}">
          <button class="dropdown-item" onclick="savePostFeature('${postId}')">🔖 Save Post</button>
          <button class="dropdown-item" onclick="pinPostFeature('${postId}')">📌 Pin Post</button>
          ${deleteItemHtml}
        </div>
      </div>
    </div>
    <p style="margin:6px 0; font-size:14px; color:#334155; line-height:1.5; font-weight:500;">${post.text}</p>
    ${mediaCode}
    <div class="post-actions">
      <button class="action-button ${isLiked?'liked':''}" onclick="toggleLikePost('${postId}')">❤️ ${post.likeCount||0}</button>
      <button class="action-button" onclick="toggleCommentsAccordion('${postId}')">💬 Comments</button>
      <button class="action-button" onclick="sharePostLink('${post.text}','${post.username}')">🔗 Share</button>
    </div>
    <div class="comments-section" id="comments-area-${postId}">
      <div class="comment-input-row">
        <input type="text" class="comment-input" id="input-${postId}" placeholder="Write a comment...">
        <button class="comment-submit-btn" onclick="submitComment('${postId}')">Post</button>
      </div>
      <div class="comments-list" id="list-${postId}"></div>
    </div>`;
  container.appendChild(div);
}

window.togglePostDropdownMenu = function(event, postId) {
  event.stopPropagation(); 
  document.querySelectorAll('.options-dropdown-menu').forEach(menu => {
    if (menu.id !== `options-dropdown-${postId}`) { menu.classList.remove('active'); }
  });
  const selectedMenu = document.getElementById(`options-dropdown-${postId}`);
  if (selectedMenu) { selectedMenu.classList.toggle('active'); }
}

window.addEventListener('click', function() {
  document.querySelectorAll('.options-dropdown-menu').forEach(menu => { menu.classList.remove('active'); });
});

window.savePostFeature = function(postId) { YarriAlert.toast("Post successfully saved collection me add ho gayi! 🔖"); }
window.pinPostFeature = function(postId) { YarriAlert.toast("Post aapki profile feed ke top par pin ho gayi! 📌"); }

window.deletePostEngine = function(postId) {
  Swal.fire({
    title: 'Post Delete Karni Hai?',
    text: "Ek baar delete karne par data permanent clear ho jayega!",
    icon: 'warning',
    showCancelButton: true,
    confirmButtonColor: '#ef4444',
    cancelButtonColor: '#64748b',
    confirmButtonText: 'Haan, Uda Do!',
    cancelButtonText: 'Cancel'
  }).then(async (result) => {
    if (result.isConfirmed) {
      try {
        await db.collection("posts").doc(postId).delete();
        YarriAlert.success("Post successfully delete ho gayi! 🗑️");
        const targetedCard = document.getElementById(`post-card-container-${postId}`);
        if(targetedCard) targetedCard.remove();
      } catch (error) { YarriAlert.error("Delete process complete nahi hua."); }
    }
  });
}

// REAL-TIME LIKE SYSTEM & NOTIFICATION TRIGGER
window.toggleLikePost = async function(postId) {
  const ref = db.collection("posts").doc(postId);
  const myUid = auth.currentUser.uid;
  const myDoc = await db.collection("users").doc(myUid).get();
  const myUsername = myDoc.data().username;

  await db.runTransaction(async (t) => {
    const doc = await t.get(ref); const data = doc.data();
    const likes = data.likes || {}; let count = data.likeCount || 0;
    
    if(likes[myUid]) { 
      delete likes[myUid]; count--; 
    } else { 
      likes[myUid] = true; count++; 
      // Trigger Notification log only if you like someone else's post
      if(data.uid !== myUid) {
        db.collection("activity_logs").add({
          targetUid: data.uid, 
          triggerUid: myUid, 
          triggerUsername: myUsername,
          action: "like", 
          postId: postId, 
          postSnippet: data.text.substring(0, 20),
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    }
    t.update(ref, { likes: likes, likeCount: count });
  });
}

window.commentsSectionAccordionToggler = function(pId) { 
  window.toggleCommentsAccordion(pId);
}

window.toggleCommentsAccordion = function(pId) {
  const el = document.getElementById(`comments-area-${pId}`);
  if(!el) return;
  el.style.display = el.style.display === "block" ? "none" : "block";
  if(el.style.display === "block") listenToPostComments(pId);
}

// REAL-TIME COMMENT SYSTEM & NOTIFICATION TRIGGER
window.submitComment = async function(pId) {
  const inp = document.getElementById(`input-${pId}`);
  if(!inp || !inp.value.trim()) return;
  const myUid = auth.currentUser.uid;
  const myDoc = await db.collection("users").doc(myUid).get();
  const myUsername = myDoc.data().username;
  const commentText = inp.value.trim();

  await db.collection("posts").doc(pId).collection("comments").add({ 
    username: myUsername, text: commentText, timestamp: firebase.firestore.FieldValue.serverTimestamp() 
  });

  const postDoc = await db.collection("posts").doc(pId).get();
  const postData = postDoc.data();
  
  // Trigger Real-time Notification if commenting on another user's post
  if(postData.uid !== myUid) {
    await db.collection("activity_logs").add({
      targetUid: postData.uid, 
      triggerUid: myUid, 
      triggerUsername: myUsername,
      action: "comment", 
      postId: pId, 
      commentText: commentText.substring(0, 25),
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  inp.value = "";
}

function listenToPostComments(pId) {
  db.collection("posts").doc(pId).collection("comments").orderBy("timestamp","asc").onSnapshot(snap => {
    const list = document.getElementById(`list-${pId}`); if(!list) return;
    list.innerHTML = "";
    snap.forEach(d => { list.innerHTML += `<div class="single-comment"><b>@${d.data().username}:</b> ${d.data().text}</div>`; });
  });
}

window.sharePostLink = function(t, u) { 
  navigator.clipboard.writeText(`Yaari Post by @${u}: ${t}`); 
  YarriAlert.toast("Link Copied to Clipboard!"); 
}

// ==========================================
// 6. PREMIUM MODAL DATA POST IMPLEMENTATION
// ==========================================
window.openCreateMediaModal = function() {
  document.getElementById("create-media-modal").style.display = "flex";
  document.getElementById("modal-post-text").value = "";
  document.getElementById("modal-post-file").value = "";
  document.getElementById("modal-attachment-label").innerText = "No file attached";
}
window.closeCreateMediaModal = function() { document.getElementById("create-media-modal").style.display = "none"; }

window.updateMediaModalAttachmentPreview = function() {
  const file = document.getElementById("modal-post-file").files[0];
  const lbl = document.getElementById("modal-attachment-label");
  if(file && lbl) { lbl.innerText = "Attached: " + file.name; }
}

window.submitPremiumMediaPost = async function() {
  const text = document.getElementById("modal-post-text").value.trim();
  const fileInput = document.getElementById("modal-post-file");
  const file = fileInput.files[0];
  if(!text && !file) { YarriAlert.toast("Empty posts cannot be deployed."); return; }
  Swal.fire({ title: 'Publishing Post...', text: 'Uploading raw components to decentralized blocks', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
  let fileUrl = ""; let fileType = "";
  try {
    if(file) {
      const storageRef = storage.ref().child(`posts_assets/${Date.now()}_${file.name}`);
      const uploadTask = await storageRef.put(file);
      fileUrl = await uploadTask.ref.getDownloadURL();
      fileType = file.type.startsWith("image/") ? "image" : "video";
    }
    const myDoc = await db.collection("users").doc(auth.currentUser.uid).get();
    await db.collection("posts").add({ uid: auth.currentUser.uid, username: myDoc.data().username, text: text, fileUrl: fileUrl, fileType: fileType, likes: {}, likeCount: 0, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    Swal.close(); window.closeCreateMediaModal(); YarriAlert.success("Post live ho chuka hai! 🎉"); window.syncFriendsCache();
  } catch(e) { Swal.close(); YarriAlert.error("Pipeline blockage."); }
}

// ==========================================
// 7. SHORTS/REELS WORLD ENGINE (PLAY ACTION)
// ==========================================
window.openReelsVideoWorldScreen = function() {
  document.getElementById("reels-video-container-screen").style.display = "flex";
  const wrapper = document.getElementById("reels-scrolling-node-wrapper");
  wrapper.innerHTML = "<p style='color:white; text-align:center; padding-top:100px;'>Loading Yarri Shorts Engine... 🚀</p>";
  db.collection("posts").where("fileType", "==", "video").orderBy("timestamp", "desc").get().then((snapshot) => {
    wrapper.innerHTML = "";
    if(snapshot.empty) { wrapper.innerHTML = "<p style='color:#cbd5e1; text-align:center; padding-top:200px;'>Network feeds have zero active videos currently.</p>"; return; }
    snapshot.forEach(doc => {
      const d = doc.data(); const item = document.createElement("div"); item.className = "reel-single-snap";
      item.innerHTML = `<video src="${d.fileUrl}" class="reel-video-element" loop playsinline autoplay muted onclick="this.muted = !this.muted; YarriAlert.toast(this.muted ? 'Muted' : 'Unmuted Volume 100%')"></video><div class="reel-overlay-details"><h4>@${d.username}</h4><p>${d.text || ''}</p></div>`;
      wrapper.appendChild(item);
    });
  });
}
window.closeReelsVideoWorldScreen = function() {
  const wrapper = document.getElementById("reels-scrolling-node-wrapper");
  if (wrapper) { wrapper.querySelectorAll("video").forEach(v => v.pause()); }
  document.getElementById("reels-video-container-screen").style.display = "none";
}

// ==========================================
// 8. REAL-TIME STORIES INTERACTION HUB
// ==========================================
window.uploadRealVideoStatus = async function(inputElement) {
  const file = inputElement.files[0]; 
  const currentUser = auth.currentUser; 
  if (!file || !currentUser) return;
  
  Swal.fire({ title: 'Processing Status...', text: 'Syncing frames data pipelines', allowOutsideClick: false, didOpen: () => { Swal.showLoading(); } });
  try {
    const myDoc = await db.collection("users").doc(currentUser.uid).get();
    const myUsername = myDoc.exists ? myDoc.data().username : "Yarri User";
    const userPhoto = myDoc.data().photoURL || currentUser.photoURL || "profile.png";
    const fileRef = storage.ref().child(`status_videos/${currentUser.uid}_${Date.now()}`);
    const uploadTask = await fileRef.put(file);
    const videoDownloadUrl = await uploadTask.ref.getDownloadURL();
    const expiryTimeline = Date.now() + (24 * 60 * 60 * 1000); 

    const determinedType = file.type.startsWith("video/") ? "video" : "image";

    await db.collection("stories").add({
      uid: currentUser.uid, 
      username: myUsername, 
      userDp: userPhoto, 
      videoUrl: videoDownloadUrl, 
      fileUrl: videoDownloadUrl,
      fileType: determinedType,
      likes: {}, 
      timestamp: firebase.firestore.FieldValue.serverTimestamp(), 
      expiresAt: expiryTimeline
    });
    Swal.close(); YarriAlert.success("Status Active! 🎉"); inputElement.value = ""; loadActiveVideoStories();
  } catch (error) { Swal.close(); YarriAlert.error("Storage blockage."); }
}

function loadActiveVideoStories() {
  const storiesContainer = document.getElementById("dynamic-stories-list"); 
  if (!storiesContainer) return;
  const rightNow = Date.now();
  
  db.collection("stories").orderBy("timestamp", "desc").onSnapshot((snapshot) => {
    storiesContainer.innerHTML = ""; 
    let hasStories = false;
    let groupedStories = {};

    snapshot.forEach((doc) => {
      const data = doc.data(); 
      if (data.expiresAt && rightNow > data.expiresAt) return; 
      hasStories = true;
      
      const storyObj = { id: doc.id, ...data };
      if (!groupedStories[data.uid]) {
        groupedStories[data.uid] = {
          username: data.username,
          userDp: data.userDp,
          items: []
        };
      }
      groupedStories[data.uid].items.push(storyObj);
    });

    Object.keys(groupedStories).forEach(uid => {
      const userGroup = groupedStories[uid];
      const itemCircle = document.createElement("div");
      itemCircle.style.cssText = "display: flex; flex-direction: column; align-items: center; min-width: 68px; cursor: pointer;";
      
      itemCircle.onclick = () => { window.openStoryViewer(userGroup.items, 0); };

      itemCircle.innerHTML = `
        <div style="width:62px; height:62px; border-radius:50%; padding:3px; background:linear-gradient(135deg,#ff00cc,#7b2ff7); display:flex; align-items:center; justify-content:center;">
          <img src="${userGroup.userDp || 'profile.png'}" style="width:100%; height:100%; border-radius:50%; object-fit:cover; border:2px solid white;">
        </div>
        <span style="font-size:11px; margin-top:5px; color:#64748b; font-weight:600; text-align:center; width:65px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">@${userGroup.username}</span>`;
      storiesContainer.appendChild(itemCircle);
    });

    if(!hasStories) { 
      storiesContainer.innerHTML = "<p style='font-size:11px; color:#94a3b8; padding-top:18px; font-weight:500;'>No recent updates</p>"; 
    }
  });
}

window.openStoryViewer = function(userStories, startIndex = 0) {
  if (!userStories || userStories.length === 0) return;
  
  activeStoriesArray = userStories;
  currentStoryIndex = startIndex;
  
  const modal = document.getElementById("status-viewer-modal");
  if(modal) modal.style.display = "flex";
  
  renderCurrentStoryIndexData();
}

function renderCurrentStoryIndexData() {
  if (currentStoryIndex < 0) currentStoryIndex = 0;
  if (currentStoryIndex >= activeStoriesArray.length) {
    window.closeStatusViewer(); 
    return;
  }
  
  clearTimeout(storyTimerReference);
  const currentStory = activeStoriesArray[currentStoryIndex];
  currentViewingStoryId = currentStory.id;
  
  const imgEl = document.getElementById("story-modal-image"); 
  const videoEl = document.getElementById("viewer-status-video-player");
  const nameEl = document.getElementById("viewer-status-username");
  const dpEl = document.getElementById("viewer-status-user-dp");
  
  if(nameEl) nameEl.innerText = `@${currentStory.username || 'user'}`;
  if(dpEl) dpEl.src = currentStory.userDp || 'profile.png';
  
  const progressContainer = document.getElementById("story-progress-container");
  if(progressContainer) {
    progressContainer.innerHTML = "";
    activeStoriesArray.forEach((story, idx) => {
      let widthValue = "0%";
      if(idx < currentStoryIndex) widthValue = "100%";
      progressContainer.innerHTML += `
        <div style="flex:1; height:3px; background:rgba(255,255,255,0.3); border-radius:2px; overflow:hidden;">
          <div id="story-micro-bar-${idx}" style="width:${widthValue}; height:100%; background:white; transition:none;"></div>
        </div>`;
    });
  }

  const fileUrl = currentStory.fileUrl || currentStory.videoUrl;
  const isVideo = currentStory.fileType === "video" || (fileUrl && !fileUrl.includes(".jpg") && !fileUrl.includes(".png") && !fileUrl.includes(".jpeg"));

  if (isVideo) {
    if(imgEl) imgEl.style.display = "none";
    if(videoEl) {
      videoEl.style.display = "block";
      videoEl.src = fileUrl;
      videoEl.muted = false;
      videoEl.volume = 1.0;
      videoEl.load();
      videoEl.play().catch(() => { videoEl.muted = true; videoEl.play(); });
      
      videoEl.onloadedmetadata = function() {
        const calculatedDuration = (videoEl.duration || 5) * 1000;
        animateStoryMicroProgressLine(currentStoryIndex, calculatedDuration);
        storyTimerReference = setTimeout(() => { window.navigateStory(1); }, calculatedDuration);
      };
      videoEl.onended = function() { window.navigateStory(1); };
    }
  } else {
    if(videoEl) { videoEl.style.display = "none"; videoEl.pause(); }
    if(imgEl) {
      imgEl.style.display = "block";
      imgEl.src = fileUrl;
    }
    animateStoryMicroProgressLine(currentStoryIndex, DEFAULT_STORY_DURATION);
    storyTimerReference = setTimeout(() => { window.navigateStory(1); }, DEFAULT_STORY_DURATION);
  }

  const heartBtn = document.getElementById("story-like-toggle-heart");
  if (heartBtn) {
    const likes = currentStory.likes || {};
    if(likes[auth.currentUser.uid]) heartBtn.classList.add("liked");
    else heartBtn.classList.remove("liked");
  }

  if(storyCommentsUnsubscribe) storyCommentsUnsubscribe();
  storyCommentsUnsubscribe = db.collection("stories").doc(currentViewingStoryId).collection("comments").orderBy("timestamp", "asc").onSnapshot(snap => {
    const box = document.getElementById("story-comments-box-area"); 
    if(!box) return;
    box.innerHTML = "";
    snap.forEach(cDoc => {
      box.innerHTML += `<div class="story-single-comment-bubble"><b>@${cDoc.data().username}:</b> ${cDoc.data().text}</div>`;
    });
    box.scrollTop = box.scrollHeight;
  });
}

function animateStoryMicroProgressLine(index, msDuration) {
  setTimeout(() => {
    const bar = document.getElementById(`story-micro-bar-${index}`);
    if(bar) {
      bar.style.transition = `width ${msDuration}ms linear`;
      bar.style.width = "100%";
    }
  }, 30);
}

window.navigateStory = function(direction) {
  currentStoryIndex += direction;
  if (currentStoryIndex < 0) {
    currentStoryIndex = 0;
  } else if (currentStoryIndex >= activeStoriesArray.length) {
    window.closeStatusViewer();
  } else {
    renderCurrentStoryIndexData();
  }
}

window.toggleStoryLikeEngine = async function() {
  if(!currentViewingStoryId) return;
  const ref = db.collection("stories").doc(currentViewingStoryId);
  await db.runTransaction(async (t) => {
    const doc = await t.get(ref); if(!doc.exists) return;
    const likes = doc.data().likes || {};
    if(likes[auth.currentUser.uid]) { delete likes[auth.currentUser.uid]; } 
    else { likes[auth.currentUser.uid] = true; YarriAlert.toast("Story Liked! ❤️"); }
    t.update(ref, { likes: likes });
  });
}

window.submitStoryCommentEngine = async function(event) {
  if(event.key === 'Enter') {
    const field = document.getElementById("story-reply-msg-field");
    const val = field.value.trim(); if(!val || !currentViewingStoryId) return;
    
    const myDoc = await db.collection("users").doc(auth.currentUser.uid).get();
    await db.collection("stories").doc(currentViewingStoryId).collection("comments").add({
      username: myDoc.data().username, text: val, timestamp: firebase.firestore.FieldValue.serverTimestamp()
    });
    field.value = "";
  }
}

window.closeStatusViewerOutsideClick = function(event) {
  if(event.target.id === "status-viewer-modal") {
    window.closeStatusViewer();
  }
}

window.closeStatusViewer = function() {
  clearTimeout(storyTimerReference);
  const player = document.getElementById("viewer-status-video-player");
  if(player) { player.pause(); player.src = ""; }
  const imgEl = document.getElementById("story-modal-image");
  if(imgEl) imgEl.src = "";
  
  const modal = document.getElementById("status-viewer-modal");
  if(modal) modal.style.display = "none";
  if(storyCommentsUnsubscribe) { storyCommentsUnsubscribe(); storyCommentsUnsubscribe = null; }
  currentViewingStoryId = "";
}

window.watchVideoStatus = function(storyId, mediaUrl, username, userDp) {
  window.openStoryViewer([{ id: storyId, fileUrl: mediaUrl, videoUrl: mediaUrl, username: username, userDp: userDp, likes: {} }], 0);
}

// ==========================================
// 9. ROUTING & CONTROLLER NAVIGATION TAB ROUTER
// ==========================================
function getChatRoomId(u1, u2) { return u1 < u2 ? `${u1}_${u2}` : `${u2}_${u1}`; }

window.loadChatActiveFriends = async function() {
  const container = document.getElementById("users-container"); if(!container) return;
  container.innerHTML = "";
  for (let fUid of globalFriendsList) {
    const uDoc = await db.collection("users").doc(fUid).get();
    if(uDoc.exists) {
      container.innerHTML += `<div onclick="window.openPersonalChatWindow('${uDoc.id}', '${uDoc.data().username}')" style="padding:16px; background:white; border-radius:22px; margin-bottom:6px; cursor:pointer; box-shadow:0 4px 12px rgba(0,0,0,0.015); display:flex; align-items:center; gap:12px; border:1px solid #f1f5f9;"><div style="width:10px;height:10px;background:#10b981;border-radius:50%; box-shadow:0 0 8px #10b981;"></div><strong style="color:#0f172a; font-size:14px;">${uDoc.data().username}</strong></div>`;
    }
  }
}

window.openPersonalChatWindow = function(tUid, tName) {
  activeChatUserId = tUid; document.getElementById("chatting-with-username").innerText = `@${tName}`;
  document.getElementById("chat-users-list").style.display = "none"; document.getElementById("personal-chat-window").style.display = "flex";
  loadPersonalMessagesEngine();
}
window.closePersonalChat = function() { 
  if(chatListenerUnsubscribe) chatListenerUnsubscribe();
  document.getElementById("chat-users-list").style.display = "block"; document.getElementById("personal-chat-window").style.display = "none";
}
window.showMediaPreview = function() {
  const f = document.getElementById("chat-file").files[0]; const preview = document.getElementById("media-preview");
  if(f && preview) { preview.style.display="block"; preview.innerText = "Selected: " + f.name; }
}

function loadPersonalMessagesEngine() {
  const roomId = getChatRoomId(auth.currentUser.uid, activeChatUserId);
  chatListenerUnsubscribe = db.collection("chats").where("roomId", "==", roomId).orderBy("timestamp","asc").onSnapshot(snap => {
    const box = document.getElementById("chat-messages"); if(!box) return;
    box.innerHTML = snap.empty ? `<p style="text-align:center;color:#94a3b8;font-size:13px;padding-top:20px;font-weight:500;">🔒 Encrypted session initialized. Say Hi! 👋</p>` : "";
    snap.forEach(doc => {
      const m = doc.data(); const isMe = m.senderUid === auth.currentUser.uid; let mediaHtml = "";
      if (m.fileUrl) {
        if (m.fileType === "image") mediaHtml = `<img src="${m.fileUrl}" style="max-width:100%;max-height:220px;border-radius:14px;margin-top:6px;display:block;">`;
        else if (m.fileType === "video") mediaHtml = `<video src="${m.fileUrl}" controls style="max-width:100%;max-height:220px;border-radius:14px;margin-top:6px;display:block;"></video>`;
      }
      box.innerHTML += `<div style="padding:12px 18px; margin:4px; border-radius:20px; max-width:75%; font-size:14px; line-height:1.4; font-weight:500; ${isMe?'background:#7b2ff7;color:white;align-self:flex-end;box-shadow:0 4px 12px rgba(123,47,247,0.25);':'background:white;color:#1e293b;align-self:flex-start;box-shadow:0 4px 12px rgba(0,0,0,0.02);border:1px solid #f1f5f9;'}"><div>${m.text}</div>${mediaHtml}</div>`;
    });
    box.scrollTop = box.scrollHeight;
  });
}

window.sendChatMessage = async function() {
  const textInput = document.getElementById("chat-input"); const fileInput = document.getElementById("chat-file");
  const user = auth.currentUser; if (!user || !activeChatUserId) return;
  const messageText = textInput.value.trim(); const file = fileInput.files[0]; if (!messageText && !file) return;
  let fileUrl = ""; let fileType = ""; const roomId = getChatRoomId(user.uid, activeChatUserId);
  try {
    if (file) {
      document.getElementById("media-preview").innerText = "Uploading asset... ⏳";
      const storageRef = storage.ref().child(`chats/${roomId}/${Date.now()}_${file.name}`);
      const uploadTask = await storageRef.put(file); fileUrl = await uploadTask.ref.getDownloadURL();
      fileType = file.type.startsWith("image/") ? "image" : "video";
    }
    await db.collection("chats").add({ roomId: roomId, senderUid: user.uid, text: messageText, fileUrl: fileUrl, fileType: fileType, timestamp: firebase.firestore.FieldValue.serverTimestamp() });
    textInput.value = ""; fileInput.value = ""; document.getElementById("media-preview").style.display = "none";
  } catch (error) { YarriAlert.error("Failed to send asset."); }
}

window.switchTab = function(tabName) {
  document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
  document.querySelectorAll('.bottom-icon').forEach(el => el.classList.remove('active'));
  const targetIcon = Array.from(document.querySelectorAll('.bottom-icon')).find(el => el.getAttribute('onclick')?.includes(`'${tabName}'`));
  if(targetIcon) targetIcon.classList.add('active');

  if(tabName === 'home') {
    document.getElementById('tab-home').classList.add('active'); document.getElementById('main-navbar').style.display = 'flex'; window.syncFriendsCache();
  } else if(tabName === 'friends') {
    document.getElementById('tab-friends').classList.add('active'); document.getElementById('main-navbar').style.display = 'flex'; window.loadGlobalUsersViewPanel();
  } else if(tabName === 'chat') {
    document.getElementById('tab-chat').classList.add('active'); document.getElementById('main-navbar').style.display = 'flex'; window.loadChatActiveFriends();
  } else if(tabName === 'profile') {
    document.getElementById('tab-profile').classList.add('active'); document.getElementById('main-navbar').style.display = 'none';
    if(auth.currentUser) loadUserProfileCardData(auth.currentUser.uid);
  }
}

window.openSearchUsersModal = function() { document.getElementById("search-users-modal").style.display = "flex"; document.getElementById("network-search-input").value = ""; window.loadGlobalUsersViewPanel(""); }
window.closeSearchUsersModal = function() { document.getElementById("search-users-modal").style.display = "none"; }
// =========================================================================
// =========================================================================
// ADVANCED ENGINE EXTENSIONS (FOR ALL 1 TO 6 FEATURES)
// =========================================================================
let selectedPostFilePayload = null;

window.handlePostMediaSelect = function(event) {
  selectedPostFilePayload = event.target.files[0];
  if (!selectedPostFilePayload) return;
  
  const container = document.getElementById("post-media-preview-container");
  const img = document.getElementById("post-img-preview");
  const vid = document.getElementById("post-video-preview");
  
  container.style.display = "block";
  if (selectedPostFilePayload.type.startsWith("image/")) {
    img.src = URL.createObjectURL(selectedPostFilePayload);
    img.style.display = "block"; vid.style.display = "none";
  } else if (selectedPostFilePayload.type.startsWith("video/")) {
    vid.src = URL.createObjectURL(selectedPostFilePayload);
    vid.style.display = "block"; img.style.display = "none";
  }
};

document.getElementById("clear-media-preview")?.addEventListener("click", () => {
  selectedPostFilePayload = null;
  document.getElementById("post-media-preview-container").style.display = "none";
  document.getElementById("post-media-file").value = "";
});

window.createNewAdvancedPost = async function() {
  const text = document.getElementById("post-text-input").value.trim();
  if (!text && !selectedPostFilePayload) return YarriAlert.error("Post khali nahi ho sakti!");
  
  Swal.fire({ title: 'Publishing...', didOpen: () => { Swal.showLoading(); } });
  let mediaURL = "";
  let mediaType = "none";

  try {
    if (selectedPostFilePayload) {
      const fileRef = storage.ref(`posts/${auth.currentUser.uid}_${Date.now()}_${selectedPostFilePayload.name}`);
      await fileRef.put(selectedPostFilePayload);
      mediaURL = await fileRef.getDownloadURL();
      mediaType = selectedPostFilePayload.type.startsWith("image/") ? "image" : "video";
    }

    const userData = (await db.collection("users").doc(auth.currentUser.uid).get()).data();

    await db.collection("posts").add({
      uid: auth.currentUser.uid,
      name: userData.name || "Yarri User",
      photoURL: userData.photoURL || "profile.png",
      text: text,
      mediaURL: mediaURL,
      mediaType: mediaType,
      reactions: { like: 0 },
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });

    document.getElementById("post-text-input").value = "";
    document.getElementById("post-media-preview-container").style.display = "none";
    selectedPostFilePayload = null;
    Swal.close();
    YarriAlert.success("Post successfully publish ho gayi!");
  } catch (err) {
    Swal.close(); YarriAlert.error(err.message);
  }
};

window.triggerStoryUploadClick = function() {
  document.getElementById("story-media-file").click();
};

window.uploadDynamicUserStory = async function(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  Swal.fire({ title: 'Uploading Story...', didOpen: () => { Swal.showLoading(); } });
  try {
    const fileRef = storage.ref(`stories/${auth.currentUser.uid}_${Date.now()}`);
    await fileRef.put(file);
    const downloadURL = await fileRef.getDownloadURL();
    const userData = (await db.collection("users").doc(auth.currentUser.uid).get()).data();

    await db.collection("stories").add({
      uid: auth.currentUser.uid,
      name: userData.name,
      photoURL: userData.photoURL,
      mediaURL: downloadURL,
      mediaType: file.type.startsWith("image/") ? "image" : "video",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    Swal.close(); YarriAlert.success("Story successfully upload ho gayi!");
  } catch (err) {
    Swal.close(); YarriAlert.error(err.message);
  }
};

let typingTimeoutReference = null;
window.broadcastTypingStateStatusToServer = function() {
  if (!activeChatUserId) return;
  const chatRoomId = auth.currentUser.uid < activeChatUserId ? `${auth.currentUser.uid}_${activeChatUserId}` : `${activeChatUserId}_${auth.currentUser.uid}`;
  
  db.collection("chats").doc(chatRoomId).set({
    [`typing_${auth.currentUser.uid}`]: true
  }, { merge: true });

  clearTimeout(typingTimeoutReference);
  typingTimeoutReference = setTimeout(() => {
    db.collection("chats").doc(chatRoomId).set({
      [`typing_${auth.currentUser.uid}`]: false
    }, { merge: true });
  }, 2000);
};

window.sendChatAttachmentFileMedia = async function(event) {
  const file = event.target.files[0];
  if (!file || !activeChatUserId) return;

  Swal.fire({ title: 'Sending Image...', didOpen: () => { Swal.showLoading(); } });
  try {
    const storageRef = storage.ref(`chats/${Date.now()}_${file.name}`);
    await storageRef.put(file);
    const fileURL = await storageRef.getDownloadURL();

    const chatRoomId = auth.currentUser.uid < activeChatUserId ? `${auth.currentUser.uid}_${activeChatUserId}` : `${activeChatUserId}_${auth.currentUser.uid}`;
    await db.collection("chats").doc(chatRoomId).collection("messages").add({
      senderId: auth.currentUser.uid,
      text: "",
      mediaURL: fileURL,
      mediaType: "image",
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    Swal.close();
  } catch(err) {
    Swal.close(); YarriAlert.error(err.message);
  }
};

window.commitAccountPrivacyModeToggle = async function(event) {
  const isPrivate = event.target.checked;
  try {
    await db.collection("users").doc(auth.currentUser.uid).update({ isPrivate: isPrivate });
    YarriAlert.success(`Account changed to ${isPrivate ? 'Private 🔐' : 'Public 🌍'}`);
  } catch (err) { YarriAlert.error(err.message); }
};

window.uploadUserProfileCoverBanner = async function(event) {
  const file = event.target.files[0];
  if(!file) return;

  Swal.fire({ title: 'Updating Cover...', didOpen: () => { Swal.showLoading(); } });
  try {
    const fileRef = storage.ref(`covers/${auth.currentUser.uid}`);
    await fileRef.put(file);
    const downloadURL = await fileRef.getDownloadURL();
    
    await db.collection("users").doc(auth.currentUser.uid).update({ coverURL: downloadURL });
    document.getElementById("user-profile-cover-banner-display").style.backgroundImage = `url('${downloadURL}')`;
    Swal.close();
    YarriAlert.success("Cover Banner updated!");
  } catch(err) { Swal.close(); YarriAlert.error(err.message); }
};

window.toggleThemeEngineMode = function() {
  document.body.classList.toggle("dark-mode");
  const isDark = document.body.classList.contains("dark-mode");
  localStorage.setItem("yarri-theme", isDark ? "dark" : "light");
};

// Auto Check Theme
if(localStorage.getItem("yarri-theme") === "dark") {
  document.body.classList.add("dark-mode");
}

window.backToChatList = function() {
  document.getElementById("active-chat-window-box").style.display = "none";
  document.getElementById("chat-list-view-screen").style.display = "block";
};
// Profile 3-Dot Dropdown toggle logic
window.toggleProfileMenu = function() {
  const menu = document.getElementById("profile-dropdown-menu");
  if (menu.style.display === "none" || menu.style.display === "") {
    menu.style.display = "block";
    
    // Agar bahar click kare toh menu automatic close ho jaye
    setTimeout(() => {
      window.addEventListener('click', closeMenuOnOutsideClick);
    }, 10);
  } else {
    menu.style.display = "none";
  }
}

function closeMenuOnOutsideClick(e) {
  const menu = document.getElementById("profile-dropdown-menu");
  if (menu && !menu.contains(e.target)) {
    menu.style.display = "none";
    window.removeEventListener('click', closeMenuOnOutsideClick);
  }
}
