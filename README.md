# Game Developer Portfolio - HTML & Tailwind Version

A modern, responsive portfolio website built with plain HTML, Tailwind CSS, and vanilla JavaScript.

## Features

- ✅ Responsive design (mobile, tablet, desktop)
- ✅ Reusable header and footer components
- ✅ Smooth scrolling navigation
- ✅ Two pages: Home (index.html) and Projects (projects.html)
- ✅ Clean, modern dark theme
- ✅ Easy to customize

## How to Run

### Option 1: Just Open the File
1. Download all files to a folder
2. Open `index.html` in your web browser
3. That's it! No installation needed.

### Option 2: Use a Local Server (Recommended)
Using a local server is better for testing:

**With Python (if you have it installed):**
```bash
# Python 3
python -m http.server 8000

# Python 2
python -m SimpleHTTPServer 8000
```

**With Node.js (if you have it installed):**
```bash
# Install http-server globally
npm install -g http-server

# Run the server
http-server
```

**With VS Code:**
- Install the "Live Server" extension
- Right-click `index.html` and select "Open with Live Server"

Then open your browser to `http://localhost:8000` (or whatever port is shown)

## File Structure

```
portfolio/
├── index.html          # Main home page
├── projects.html       # Projects page
├── components.js       # Header and footer components
└── README.md          # This file
```

## Customization

### Update Your Information

1. **Header/Footer** - Edit in `components.js`:
   - Change "Game Developer" to your name
   - Update the footer copyright

2. **Home Page** - Edit `index.html`:
   - Update the hero section with your title and description
   - Replace "About Me" content
   - Add your real games (replace placeholder images and text)
   - Update resume section with your education, experience, and skills
   - Change social media links in the contact section

3. **Projects Page** - Edit `projects.html`:
   - Replace project cards with your actual projects
   - Update images, descriptions, and tags

### Change Colors

The site uses Tailwind CSS colors. To change the theme:
- `blue-500` → `purple-500` (change blue to purple)
- `slate-800` → `gray-800` (change background colors)

### Add Your Own Images

Replace the Unsplash URLs with your own images:
```html
<img src="images/my-game.png" alt="My Game">
```

## Using Tailwind CSS

This portfolio uses Tailwind via CDN (no installation needed). The classes are:

- `bg-*` = background colors
- `text-*` = text colors/sizes
- `p-*` = padding
- `m-*` = margin
- `rounded-*` = border radius
- `hover:*` = hover effects

Learn more at: https://tailwindcss.com/docs

## Tips

1. **Replace placeholder content** with your real information
2. **Add your own images** for games and projects
3. **Update links** - change all `#` links to real URLs
4. **Test on mobile** - open on your phone to check responsiveness
5. **Deploy** - Upload to GitHub Pages, Netlify, or Vercel for free hosting

## Deployment

### GitHub Pages (Free)
1. Create a GitHub account
2. Create a new repository
3. Upload all files
4. Go to Settings → Pages
5. Select "main" branch
6. Your site will be live at `username.github.io/repository-name`

### Netlify (Free)
1. Create account at netlify.com
2. Drag and drop your folder
3. Done! You get a free URL

## Need Help?

- Tailwind CSS Docs: https://tailwindcss.com
- Font Awesome Icons: https://fontawesome.com/icons
- HTML/CSS Reference: https://developer.mozilla.org

Good luck with your portfolio! 🎮
