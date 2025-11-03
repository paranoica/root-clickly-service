document.addEventListener("DOMContentLoaded", function () {
    const form = document.getElementById("reset-password-form");

    form.onsubmit = async function (e) {
        e.preventDefault();

        const newPassword = document.getElementById("new-password");
        const confirmPassword = document.getElementById("confirm-password");

        if (newPassword.value.length < 8) {
            showNotification("The password must contain at least 8 characters", "error");
            return;
        }

        if (newPassword.value !== confirmPassword.value) {
            showNotification("The passwords does not match", "error");
            return;
        }

        const params = new URLSearchParams(window.location.search);
        const token = params.get("token");

        if (!token) {
            showNotification("Invalid password reset link", "error");
            return;
        }

        function translateResetError(message) {
            const translations = [
                { pattern: /expired|истек/i, text: "The link has expired. Please request a reset again." },
                { pattern: /token.*invalid|invalid.*token|bad token|bad signature|signature.*invalid/i, text: "Incorrect or outdated reset link." },
                { pattern: /password.*short|password.*weak|слишком короткий/i, text: "The password is too short or simple." },
                { pattern: /password.*required|required/i, text: "Enter a new password." },
                { pattern: /not found|user.*not found|пользователь.*не найден/i, text: "User not found." },
                { pattern: /mismatch|не совпад/i, text: "The passwords do not match." },
                { pattern: /server|internal/i, text: "Server error. Try again later." },
                { pattern: /validation/i, text: "Validation error. Please check the entered data." },
                { pattern: /too short/i, text: "The value is too short." },
                { pattern: /too long/i, text: "The value is too long." },
                { pattern: /required/i, text: "Please fill in the required fields." },
                { pattern: /unknown/i, text: "Unknown error." },
            ];

            for (const t of translations)
                if (t.pattern.test(message))
                    return t.text;

            return message;
        }

        try {
            const resp = await fetch("http://localhost/api/users/password-reset-confirm", {
                method: "POST",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ token, new_password: newPassword.value })
            });

            let data = {};
            try { data = await resp.json(); } catch { }

            if (resp.ok) {
                showNotification("Your password has been successfully changed! You can now sign in with your new password.", "success");
                newPassword.value = ""; confirmPassword.value = "";
            } else {
                showNotification(translateResetError(data.detail || data.message || "Password reset error"), "error");
            }
        } catch (err) {
            showNotification("Error connecting to server", "error");
        }
    };
});