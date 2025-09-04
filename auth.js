// Pinata Configuration
const PINATA_API_KEY = '3a9e81513e7c81e26d11';
const PINATA_API_SECRET = '2a937c360d5e3f5a4c18967830e92e0e2568e103479743ef8831d87c90eed9a8';
const GROUP_ID = '0198d113-1186-7ef1-82e3-e6d512cbb64e';

// DOM Elements
const signUpBtn = document.getElementById('signUpBtn');
const signInBtn = document.getElementById('signInBtn');
const registerModal = document.getElementById('registerModal');
const loginModal = document.getElementById('loginModal');
const closeRegister = document.getElementById('closeRegister');
const closeLogin = document.getElementById('closeLogin');
const registerForm = document.getElementById('registerForm');
const loginForm = document.getElementById('loginForm');
const registerMessage = document.getElementById('registerMessage');
const loginMessage = document.getElementById('loginMessage');

// Event Listeners for Modal Controls (only if elements exist)
if (signUpBtn) {
    signUpBtn.addEventListener('click', () => {
        registerModal.style.display = 'block';
    });
}

if (signInBtn) {
    signInBtn.addEventListener('click', () => {
        loginModal.style.display = 'block';
    });
}

if (closeRegister) {
    closeRegister.addEventListener('click', () => {
        registerModal.style.display = 'none';
    });
}

if (closeLogin) {
    closeLogin.addEventListener('click', () => {
        loginModal.style.display = 'none';
    });
}

window.addEventListener('click', (event) => {
    if (event.target === registerModal) {
        registerModal.style.display = 'none';
    }
    if (event.target === loginModal) {
        loginModal.style.display = 'none';
    }
});

// Register Form Submission (only if form exists)
if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        const confirmPassword = document.getElementById('confirmPassword').value;
        
        // Basic validation
        if (password !== confirmPassword) {
            showMessage(registerMessage, 'Passwords do not match', 'error');
            return;
        }
        
        if (password.length < 6) {
            showMessage(registerMessage, 'Password must be at least 6 characters', 'error');
            return;
        }
        
        try {
            // Check if user already exists
            const userExists = await checkUserExists(email);
            if (userExists) {
                showMessage(registerMessage, 'User with this email already exists', 'error');
                return;
            }
            
        // Create user data object
        const userData = {
            email,
            password, // Note: In a production app, you should hash the password before storing
            createdAt: new Date().toISOString(),
            profilePicture: 'default_image.jpg' // Add default profile picture
        };

        console.log('Registering user with data:', userData);
            
            // Store user data in Pinata group
            const result = await storeUserData(userData);
            
            if (result) {
                showMessage(registerMessage, 'Registration successful! Please sign in.', 'success');
                registerForm.reset();
                setTimeout(() => {
                    registerModal.style.display = 'none';
                }, 2000);
            }
        } catch (error) {
            console.error('Registration error:', error);
            showMessage(registerMessage, 'Registration failed. Please try again.', 'error');
        }
    });
}

// Login Form Submission (only if form exists)
if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('loginEmail').value;
        const password = document.getElementById('loginPassword').value;
        
        try {
            console.log('Login attempt for email:', email);
            // Authenticate user
            const authenticated = await authenticateUser(email, password);
            console.log('Authentication result:', authenticated);
            
        if (authenticated) {
            // Store user email in localStorage for session management
            localStorage.setItem('userEmail', email);
            console.log('Stored userEmail in localStorage:', email);
            console.log('Login successful for user:', email);

            // Try to fetch user profile picture from cached IPFS hash or Pinata
            try {
                let ipfsHash = localStorage.getItem('userDataIpfsHash');
                let userData = null;

                if (ipfsHash) {
                    console.log('Using cached IPFS hash to fetch user data:', ipfsHash);
                    try {
                        const fileResponse = await axios.get(`https://ipfs.io/ipfs/${ipfsHash}`);
                        console.log('User data fetch response status:', fileResponse.status);
                        userData = fileResponse.data;
                        console.log('Fetched user data from cache:', userData);
                    } catch (fetchError) {
                        console.error('Error fetching user data from cached IPFS hash:', fetchError);
                        localStorage.removeItem('userDataIpfsHash');
                    }
                }

                if (!userData) {
                    console.log('Fetching user files from Pinata...');
                    const response = await axios.get(
                        `https://api.pinata.cloud/data/pinList?includeCount=false&status=pinned`,
                        {
                            headers: {
                                'pinata_api_key': PINATA_API_KEY,
                                'pinata_secret_api_key': PINATA_API_SECRET
                            }
                        }
                    );

                    console.log('Pinata response status:', response.status);
                    console.log('Pinata response data:', response.data);

                    const files = response.data.rows;
                    console.log('Full Pinata files response:', response.data);
                    console.log(`Fetched ${files.length} files from Pinata.`);
                    const normalizedEmail = email.toLowerCase().trim();

                    let foundFile = null;

                    // Find user file by metadata email or filename
                    for (const file of files) {
                        if (file.metadata && file.metadata.keyvalues) {
                            const fileEmail = file.metadata.keyvalues.email;
                            if (fileEmail && fileEmail.toLowerCase().trim() === normalizedEmail) {
                                foundFile = file;
                                break;
                            }
                        }
                    }

                    // If not found by metadata, try filename (using ipfs_pin_hash or name instead of id)
                    if (!foundFile) {
                        for (const file of files) {
                            // Check ipfs_pin_hash or name property for filename matching
                            const fileName = file.name || file.ipfs_pin_hash || '';
                            if (fileName.toLowerCase().startsWith(`user_${normalizedEmail}`)) {
                                foundFile = file;
                                break;
                            }
                        }
                    }

                    if (foundFile) {
                        console.log('Found user file:', foundFile);
                        ipfsHash = foundFile.ipfs_pin_hash;
                        try {
                            const fileResponse = await axios.get(`https://ipfs.io/ipfs/${ipfsHash}`);
                            console.log('User data fetch response status:', fileResponse.status);
                            userData = fileResponse.data;
                            console.log('Fetched user data from Pinata:', userData);
                            // Store IPFS hash for session persistence
                            localStorage.setItem('userDataIpfsHash', ipfsHash);
                        } catch (fetchError) {
                            console.error('Error fetching user data from IPFS:', fetchError);
                        }
                    } else {
                        console.log('No user file found in Pinata');
                    }
                }

                if (userData) {
                    const profilePic = userData.profilePicture && userData.profilePicture.trim() !== '' ? userData.profilePicture : 'default_image.jpg';
                    console.log('Fetched profile picture URL on login:', profilePic);
                    localStorage.setItem('profilePicture', profilePic);
                } else {
                    console.log('No user data available, setting default profile picture');
                    localStorage.setItem('profilePicture', 'default_image.jpg');
                }
            } catch (error) {
                console.error('Error fetching user profile picture on login:', error);
                localStorage.setItem('profilePicture', 'default_image.jpg');
            }
            
            showMessage(loginMessage, 'Login successful! Redirecting...', 'success');
            
            // Redirect to homepage after successful login
            setTimeout(() => {
                window.location.href = 'homepage.html';
            }, 1500);
        } else {
            showMessage(loginMessage, 'Invalid email or password', 'error');
        }
        } catch (error) {
            console.error('Login error:', error);
            showMessage(loginMessage, 'Login failed. Please try again.', 'error');
        }
    });
}

// Check if user already exists in Pinata group
async function checkUserExists(email) {
    try {
        // First, get all files in the group
        const response = await axios.get(
            `https://api.pinata.cloud/data/pinList?includeCount=false&status=pinned`,
            {
                headers: {
                    'pinata_api_key': PINATA_API_KEY,
                    'pinata_secret_api_key': PINATA_API_SECRET
                }
            }
        );
        
        const files = response.data.rows;
        
        // Check each file for the email
        for (const file of files) {
            if (file.metadata && file.metadata.keyvalues) {
                const fileEmail = file.metadata.keyvalues.email;
                if (fileEmail === email) {
                    return true;
                }
            }
        }
        
        return false;
    } catch (error) {
        console.error('Error checking user existence:', error);
        throw error;
    }
}

// Store user data in Pinata group
async function storeUserData(userData) {
    try {
        // Convert user data to JSON string
        const jsonData = JSON.stringify(userData);
        
        // Create a Blob from the JSON string
        const blob = new Blob([jsonData], { type: 'application/json' });
        
        // Create a File from the Blob
        const file = new File([blob], `${userData.email}.json`, { 
            type: 'application/json',
            lastModified: Date.now()
        });
        
        // Create FormData and append the file
        const formData = new FormData();
        formData.append('file', file);
        
        // Add metadata including the group ID
        const metadata = JSON.stringify({
            name: `user_${userData.email}`,
            keyvalues: {
                email: userData.email,
                type: 'registration_data'
            }
        });
        formData.append('pinataMetadata', metadata);
        
        // Add options including the group ID
        const options = JSON.stringify({
            cidVersion: 0,
            wrapWithDirectory: false,
            customPinPolicy: {
                regions: [
                    {
                        id: 'FRA1',
                        desiredReplicationCount: 1
                    },
                    {
                        id: 'NYC1',
                        desiredReplicationCount: 2
                    }
                ]
            }
        });
        formData.append('pinataOptions', options);
        
        // Upload to Pinata
        const response = await axios.post(
            'https://api.pinata.cloud/pinning/pinFileToIPFS',
            formData,
            {
                maxContentLength: Infinity,
                headers: {
                    'Content-Type': `multipart/form-data`,
                    'pinata_api_key': PINATA_API_KEY,
                    'pinata_secret_api_key': PINATA_API_SECRET
                }
            }
        );
        
        console.log('User data stored successfully:', response.data);
        return true;
    } catch (error) {
        console.error('Error storing user data:', error);
        throw error;
    }
}

// Authenticate user against stored data
async function authenticateUser(email, password) {
    try {
        // Normalize input email and password
        const normalizedEmail = email.toLowerCase().trim();
        const normalizedPassword = password.trim();

        console.log('Starting authentication for email:', normalizedEmail);

        // First, get all files in the group
        const response = await axios.get(
            `https://api.pinata.cloud/data/pinList?includeCount=false&status=pinned`,
            {
                headers: {
                    'pinata_api_key': PINATA_API_KEY,
                    'pinata_secret_api_key': PINATA_API_SECRET
                }
            }
        );

        console.log('Pinata list response status:', response.status);
        const files = response.data.rows;
        console.log(`Found ${files.length} files in Pinata`);

        // Find the file for the specific user
        let userFile = null;
        for (const file of files) {
            if (file.metadata && file.metadata.keyvalues) {
                const fileEmail = file.metadata.keyvalues.email;
                console.log(`Checking file with email: ${fileEmail}`);
                if (fileEmail && fileEmail.toLowerCase().trim() === normalizedEmail) {
                    userFile = file;
                    console.log('Found matching user file:', file);
                    break;
                }
            }
        }

        if (!userFile) {
            console.log('No user file found for email:', normalizedEmail);
            return false;
        }

        // Fetch the file content
        const ipfsHash = userFile.ipfs_pin_hash;
        console.log('Fetching user data from IPFS hash:', ipfsHash);

        try {
            const fileResponse = await axios.get(
                `https://ipfs.io/ipfs/${ipfsHash}`
            );
            console.log('IPFS fetch response status:', fileResponse.status);
            const userData = fileResponse.data;
            console.log('Fetched user data:', userData);

            // Check if userData has the expected structure
            if (!userData || typeof userData !== 'object') {
                console.error('Invalid user data structure:', userData);
                return false;
            }

            // Normalize stored password
            const storedPassword = userData.password ? userData.password.trim() : '';

            // Debug logs for password comparison
            console.log(`Comparing passwords: input='${normalizedPassword}' stored='${storedPassword}'`);

            // Compare passwords (note: in production, use proper password hashing)
            if (storedPassword === normalizedPassword) {
                console.log('Password match successful');
                return true;
            } else {
                console.log('Password match failed');
                return false;
            }
        } catch (fetchError) {
            console.error('Error fetching user data from IPFS:', fetchError);
            console.error('IPFS hash that failed:', ipfsHash);
            return false;
        }
    } catch (error) {
        console.error('Error authenticating user:', error);
        throw error;
    }
}

// Utility function to show messages
function showMessage(element, message, type) {
    element.textContent = message;
    element.className = `message ${type}`;
    element.style.display = 'block';
    
    // Clear message after 5 seconds
    setTimeout(() => {
        element.style.display = 'none';
    }, 5000);
}

// Add global error handler for axios to log 404 errors
axios.interceptors.response.use(
    response => response,
    error => {
        if (error.response && error.response.status === 404) {
            console.error('Resource not found (404):', error.config.url);
        }
        return Promise.reject(error);
    }
);


document.addEventListener('DOMContentLoaded', () => {
    console.log('Auth.js DOM fully loaded and parsed');

    // Add event listener for search button (only if elements exist)
    const searchBtn = document.getElementById('searchBtn');
    const searchInput = document.getElementById('searchInput');
    const searchResultDiv = document.getElementById('searchResult');
    
    if (searchBtn && searchInput && searchResultDiv) {
        searchBtn.addEventListener('click', () => {
            const email = searchInput.value.trim();
            if (email) {
                searchUserByEmail(email);
            } else {
                searchResultDiv.innerHTML = '<p>Please enter an email to search.</p>';
            }
        });
    }
});

// Check if user is already logged in
window.addEventListener('DOMContentLoaded', () => {
    const userEmail = localStorage.getItem('userEmail');
    if (userEmail && window.location.pathname.endsWith('index.html')) {
        window.location.href = 'homepage.html';
    }
});