const API_CONFIG = {
    USERS_BASE_URL: "http://localhost/api/users",
    URLS_BASE_URL: "http://localhost/api/urls",
    ANALYTICS_BASE_URL: "http://localhost/api/analytics"
};

class TokenManager {
    static getToken() {
        const sessionToken = sessionStorage.getItem("access_token"); if (sessionToken)
            return sessionToken;

        const cookieToken = this.getCookie("access_token"); if (cookieToken)
            return cookieToken;

        return localStorage.getItem("access_token");
    }

    static setToken(token) {
        this.setCookie("access_token", token, 7);
        localStorage.setItem("access_token", token); sessionStorage.removeItem("access_token");
    }

    static setSessionToken(token) {
        sessionStorage.setItem("access_token", token);
        this.deleteCookie("access_token"); localStorage.removeItem("access_token");
    }

    static removeToken() {
        this.deleteCookie("access_token");
        localStorage.removeItem("access_token"); sessionStorage.removeItem("access_token");
    }

    static isAuthenticated() {
        return !!this.getToken();
    }

    static getAuthHeaders() {
        const token = this.getToken();
        return token ? { "Authorization": `Bearer ${token}` } : {};
    }

    static setCookie(name, value, days) {
        const expires = new Date();

        expires.setTime(expires.getTime() + (days * 24 * 60 * 60 * 1000));
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;secure;samesite=strict`;
    }

    static getCookie(name) {
        const nameEQ = name + "=";
        const nameCA = document.cookie.split(";");

        for (let i = 0; i < nameCA.length; i++) {
            let c = nameCA[i];

            while (c.charAt(0) === " ")
                c = c.substring(1, c.length);

            if (c.indexOf(nameEQ) === 0)
                return c.substring(nameEQ.length, c.length);
        }

        return null;
    }

    static deleteCookie(name) {
        document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
    }
}

class APIClient {
    static async makeRequest(url, options = {}) {
        const defaultHeaders = {
            "Content-Type": "application/json",
            ...TokenManager.getAuthHeaders(),
        };

        const config = {
            ...options,
            headers: { ...defaultHeaders, ...options.headers },
            mode: "cors",
            credentials: "include",
        };

        try {
            const response = await fetch(url, config);
            let data;
            
            try {
                data = await response.json();
            } catch (jsonError) {
                console.log("JSON parsing failed, trying text...", jsonError);
                const text = await response.text();
                console.log("Failed to parse JSON, using text:", text);

                data = {
                    detail: text || `HTTP error! status: ${response.status}`
                };
            }

            if (response.status === 401)
                TokenManager.removeToken();

            if (!response.ok) {
                let errorMessage = "An unknown error occurred";
                let originalMessage = "";

                if (data.detail) {
                    if (Array.isArray(data.detail))
                        originalMessage = data.detail.map(err => err.msg || err.type || "Unknown error").join(", ");
                    else if (typeof data.detail === "string")
                        originalMessage = data.detail;
                } else if (data.message) {
                    originalMessage = data.message;
                } else if (data.error) {
                    originalMessage = data.error;
                }

                console.log("Original message from the server:", originalMessage);
                console.log("Full data object:", JSON.stringify(data, null, 2));

                const errorTranslations = {
                    "Unauthorized": "Incorrect login or password",
                    "Invalid credentials": "Incorrect login or password",
                    "Could not validate credentials": "Your session has expired. Please sign in again",
                    "Token expired": "Your session has expired. Please sign in again",
                    "Access token expired": "Your session has expired. Please sign in again",

                    "User not found": "User not found",
                    "Email already exists": "This email is already in use",
                    "Username already exists": "This username is already taken",
                    "User already exists": "The user already exists",
                    "Please verify your email address before logging in": "Please confirm your email first. Check your email",
                    "Email is not verified": "Email not confirmed. Check your email",

                    "Invalid email format": "Incorrect email format",
                    "value is not a valid email address": "Incorrect email address",
                    "Password too short": "The password is too short (minimum 8 characters)",
                    "Password must contain at least one uppercase letter": "The password must contain a uppercase letter",
                    "Password must contain at least one lowercase letter": "The password must contain a lowercase letter",
                    "Password must contain at least one digit": "The password must contain a number",
                    "String should have at least 8 characters": "Minimum 8 characters",
                    "field required": "Required field",

                    "Invalid URL format": "Invalid link format",
                    "URL too long": "The link is too long",
                    "Short code already exists": "This short code already exists",
                    "URL not found": "Link not found",

                    "Access denied": "Access restricted",
                    "Rate limit exceeded": "Too many requests. Try again later",
                    "Server error": "Server error. Please try again late",
                    "Network error": "Network problems. Check your internet connection",
                    "Internal server error": "Internal server error",
                    "Service unavailable": "The service is temporarily unavailable",

                    "Email \"(.*?)\" already registered": "Этот email уже зарегистрирован",
                    "Username \"(.*?)\" already registered": "This username is already taken",
                    "Authentication failed": "Ошибка авторизации",
                    "Login failed": "Не удалось войти в систему"
                };

                function translateError(errorText) {
                    if (!errorText)
                        return "An unknown error occurred";

                    const lowerError = errorText.toLowerCase();
                    if (lowerError.includes("unauthorized") || lowerError.includes("401"))
                        return "Incorrect login or password";

                    if (lowerError.includes("email") && lowerError.includes("already"))
                        return "This email is already in use";

                    if (lowerError.includes("username") && lowerError.includes("already"))
                        return "This username is already taken";

                    if (lowerError.includes("email") && (lowerError.includes("verify") || lowerError.includes("not verified")))
                        return "Please confirm your email first. Check your email";

                    if (lowerError.includes("token") && (lowerError.includes("expired") || lowerError.includes("invalid")))
                        return "Your session has expired. Please sign in again";

                    if (lowerError.includes("rate limit"))
                        return "Too many requests. Try again in a minute";

                    if (lowerError.includes("network") || lowerError.includes("fetch"))
                        return "Network problems. Check your internet connection";

                    if (lowerError.includes("server error") || lowerError.includes("500"))
                        return "Server error. Please try again later";

                    if (errorTranslations[errorText])
                        return errorTranslations[errorText];

                    if (errorText.includes("already registered")) {
                        if (errorText.includes("Email"))
                            return "This email is already registered";
                        else if (errorText.includes("Username"))
                            return "This username is already taken";
                    }

                    if (errorText.includes("Password must contain")) {
                        if (errorText.includes("uppercase"))
                            return "The password must contain a uppercase letter";
                        else if (errorText.includes("lowercase"))
                            return "The password must contain a lowercase letter";
                        else if (errorText.includes("digit"))
                            return "The password must contain a number";
                    }

                    if (errorText.length > 100)
                        return "An error occurred. Please try again";

                    return errorText;
                }

                if (data.detail) {
                    if (Array.isArray(data.detail)) {
                        errorMessage = data.detail.map(err => {
                            if (err.msg)
                                return translateError(err.msg);

                            return translateError(err.type) || err.type || "Validation error";
                        }).join(", ");
                    } else if (typeof data.detail === "string") {
                        errorMessage = translateError(data.detail);
                    }
                } else if (data.message) {
                    errorMessage = translateError(data.message);
                } else if (data.error) {
                    errorMessage = translateError(data.error);
                }

                if (response.status === 401 && (!errorMessage || errorMessage === "An unknown error occurred")) {
                    errorMessage = "Incorrect login or password";
                } else if (response.status === 403) {
                    errorMessage = "Access denied";
                } else if (response.status === 404) {
                    errorMessage = "Resource not found";
                } else if (response.status === 422) {
                    errorMessage = errorMessage || "Please check that the entered data is correct";
                } else if (response.status === 429) {
                    errorMessage = "Too many requests. Try again in a minute";
                } else if (response.status >= 500) {
                    errorMessage = "Server error. Please try again later";
                } else if (response.status === 400) {
                    errorMessage = errorMessage || "Incorrect data";
                }

                const error = new Error(errorMessage); error.originalMessage = originalMessage;
                throw error;
            }

            return data;
        } catch (error) {
            console.error("API request failed:", error);
            console.log("Error details:", {
                name: error.name,
                message: error.message,
                stack: error.stack
            });

            if (error.originalMessage !== undefined)
                throw error;

            if (error.name === "TypeError" || error.message.includes("fetch"))
                throw new Error("Unable to connect to the server. Check your internet connection");

            if (error.message.includes("CORS"))
                throw new Error("Server access error");

            if (error.message.includes("timeout"))
                throw new Error("The server took too long to respond. Please try again");

            throw error;
        }
    }

    static async makeAnonymousRequest(url, options = {}) {
        const defaultHeaders = {
            "Content-Type": "application/json",
        };

        const config = {
            ...options,
            headers: { ...defaultHeaders, ...options.headers },
            mode: "cors",
            credentials: "include",
        };

        try {
            const response = await fetch(url, config);
            let data;

            try {
                data = await response.json();
            } catch (jsonError) {
                console.log("JSON parsing failed, trying text...", jsonError);
                const text = await response.text();
                console.log("Failed to parse JSON, using text:", text);

                data = { detail: text || `HTTP error! status: ${response.status}` };
            }

            if (!response.ok) {
                let errorMessage = "An unknown error occurred";
                let originalMessage = "";

                if (data.detail) {
                    if (Array.isArray(data.detail))
                        originalMessage = data.detail.map(err => err.msg || err.type || "Unknown error").join(", ");
                    else if (typeof data.detail === "string")
                        originalMessage = data.detail;
                } else if (data.message) {
                    originalMessage = data.message;
                } else if (data.error) {
                    originalMessage = data.error;
                }

                if (response.status === 400)
                    errorMessage = originalMessage || "Invalid request data";
                else if (response.status === 422)
                    errorMessage = originalMessage || "Please check that the entered data is correct";
                else if (response.status === 429)
                    errorMessage = "Too many requests. Try again in a minute";
                else if (response.status >= 500)
                    errorMessage = "Server error. Please try again later";
                else
                    errorMessage = originalMessage || "An error occurred";

                const error = new Error(errorMessage); error.originalMessage = originalMessage;
                console.log("Anonymous request error:", { message: errorMessage, original: originalMessage });

                throw error;
            }

            return data;
        } catch (error) {
            console.error("Anonymous API request failed:", error);

            if (error.originalMessage !== undefined)
                throw error;

            if (error.name === "TypeError" || error.message.includes("fetch"))
                throw new Error("Unable to connect to the server. Check your internet connection");

            if (error.message.includes("CORS"))
                throw new Error("Server access error");

            if (error.message.includes("timeout"))
                throw new Error("The server took too long to respond. Please try again");

            throw error;
        }
    }

    static async register(userData) {
        return this.makeRequest(`${API_CONFIG.USERS_BASE_URL}/register`, {
            method: "POST",
            body: JSON.stringify({
                email: userData.email,
                username: userData.username,
                password: userData.password
            })
        });
    }

    static async login(credentials) {
        return this.makeRequest(`${API_CONFIG.USERS_BASE_URL}/login`, {
            method: "POST",
            body: JSON.stringify({
                identifier: credentials.identifier,
                password: credentials.password
            })
        });
    }

    static async logout() {
        return this.makeRequest(`${API_CONFIG.USERS_BASE_URL}/logout`, {
            method: "POST"
        });
    }

    static async getCurrentUser() {
        return this.makeRequest(`${API_CONFIG.USERS_BASE_URL}/me`);
    }

    static async updateProfile(userData) {
        return this.makeRequest(`${API_CONFIG.USERS_BASE_URL}/me/update`, {
            method: "POST",
            body: JSON.stringify(userData)
        });
    }

    static async verifyToken() {
        return this.makeRequest(`${API_CONFIG.USERS_BASE_URL}/verify-token`, {
            method: "POST"
        });
    }

    static async resendActivation(email) {
        return this.makeRequest(`${API_CONFIG.USERS_BASE_URL}/resend-activation`, {
            method: "POST",
            body: JSON.stringify({ email })
        });
    }

    static async shortenUrl(urlData) {
        return this.makeRequest(`${API_CONFIG.URLS_BASE_URL}/shorten`, {
            method: "POST",
            body: JSON.stringify(urlData)
        });
    }

    static async getMyUrls(params = {}) {
        const queryParams = new URLSearchParams(); Object.entries(params).forEach(([key, value]) => {
            if (value !== null && value !== undefined) {
                queryParams.append(key, value);
            }
        });

        const url = `${API_CONFIG.URLS_BASE_URL}/my${queryParams.toString() ? "?" + queryParams.toString() : ""}`;
        return this.makeRequest(url);
    }

    static async updateUrl(urlId, updateData) {
        return this.makeRequest(`${API_CONFIG.URLS_BASE_URL}/${urlId}`, {
            method: "PUT",
            body: JSON.stringify(updateData)
        });
    }

    static async deactivateUrl(urlId) {
        return this.makeRequest(`${API_CONFIG.URLS_BASE_URL}/${urlId}/deactivate`, {
            method: "PATCH"
        });
    }

    static async getUrlQrCode(urlId) {
        return this.makeRequest(`${API_CONFIG.URLS_BASE_URL}/${urlId}/qr`);
    }

    static async getPublicStats() {
        return this.makeRequest(`${API_CONFIG.ANALYTICS_BASE_URL}/public/stats`);
    }
}

class ErrorHandler {
    static handle(error, context = "") {
        console.error(`Error in ${context}:`, error);

        let message = "An error occurred. Please try again.";
        if (error.message === "Unauthorized") {
            message = "You must sign in";
            return this.handleUnauthorized();
        }

        if (error.message.includes("validation"))
            message = "Please check that the entered data is correct";

        if (error.message.includes("email"))
            message = "A user with this email already exists";

        if (error.message.includes("username"))
            message = "A user with this name already exists";

        this.showError(message);
        return false;
    }

    static handleUnauthorized() {
        TokenManager.removeToken();
        showNotification("You must sign in", "error");

        const loginModal = document.getElementById("login-modal"); if (loginModal && typeof openModal === "function")
            openModal(loginModal);

        return false;
    }

    static showError(message) {
        if (typeof showNotification === "function") showNotification(message, "error"); else alert(message);
    }
}

class UserManager {
    static currentUser = null;
    static async loadCurrentUser() {
        if (!TokenManager.isAuthenticated())
            return null;

        try {
            this.currentUser = await APIClient.getCurrentUser();
            return this.currentUser;
        } catch (error) {
            console.error("Error loading current user:", error);
            return null;
        }
    }

    static getCurrentUser() {
        return this.currentUser;
    }

    static isLoggedIn() {
        return TokenManager.isAuthenticated() && this.currentUser;
    }

    static async logout() {
        try {
            await APIClient.logout();
        } catch (error) {
            console.warn("Logout API call failed:", error);
        } finally {
            TokenManager.removeToken();
            this.currentUser = null;
            this.updateUI();
        }
    }

    static updateUI() {
        if (typeof updateUserInterface === "function") {
            updateUserInterface(this.isLoggedIn());
        }
    }
}