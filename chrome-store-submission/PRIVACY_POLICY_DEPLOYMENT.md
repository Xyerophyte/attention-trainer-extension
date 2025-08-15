# Privacy Policy Deployment Instructions

## 🎯 Goal
Deploy privacy-policy.html to a publicly accessible URL for Chrome Web Store submission.

## 🚀 Option 1: GitHub Pages (Recommended - Free)

### Setup Steps:
1. Create a new GitHub repository (e.g., `attention-trainer-privacy`)
2. Upload `privacy-policy.html` to the repository
3. Enable GitHub Pages in repository Settings → Pages
4. Select "Deploy from a branch" → "main" → "/ (root)"
5. Your privacy policy will be available at:
   `https://[username].github.io/attention-trainer-privacy/privacy-policy.html`

### Quick Commands:
```bash
# Create and clone repo
gh repo create attention-trainer-privacy --public
git clone https://github.com/[username]/attention-trainer-privacy.git
cd attention-trainer-privacy

# Copy privacy policy
cp ../attention-trainer-extension/chrome-store-submission/documentation/privacy-policy.html .

# Deploy
git add privacy-policy.html
git commit -m "Add privacy policy for Chrome Web Store"
git push origin main

# Enable GitHub Pages via web interface
echo "Visit: https://github.com/[username]/attention-trainer-privacy/settings/pages"
```

## 🌐 Option 2: Other Hosting Services

### Free Options:
- **Netlify**: Drag & drop deployment
- **Vercel**: Simple static hosting  
- **Firebase Hosting**: Google's static hosting
- **GitHub Gist**: For single HTML files

### Quick Deploy URLs:
- Netlify: https://app.netlify.com/drop
- Vercel: https://vercel.com/new
- Firebase: https://console.firebase.google.com/

## ✅ Verification Steps

After deployment:
1. Visit the public URL
2. Verify privacy policy loads correctly
3. Test URL is accessible without authentication
4. Copy the URL for Chrome Web Store submission
5. Update submission checklist with the URL

## 📝 Update Submission Materials

Once deployed, update:
- Chrome Web Store listing → Privacy Policy URL field
- SUBMISSION_CHECKLIST.md → Mark privacy policy as completed
- store-listing-guide.md → Add actual privacy policy URL

## 🔗 Example Final URL Format:
`https://[username].github.io/attention-trainer-privacy/privacy-policy.html`

---

**Next Step**: Choose a deployment option and deploy privacy-policy.html!
