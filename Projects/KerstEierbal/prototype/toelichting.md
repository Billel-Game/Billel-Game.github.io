# Toelichting Prototype – Kleierbal Webshop

## 📋 Overzicht

Dit document beschrijft de ontwerpkeuzes, technische implementatie en game-integratie van het Kleierbal webshop prototype. Het prototype is ontwikkeld volgens het Programma van Eisen (PvE) en omvat alle must-haves plus de nice-to-have game-component.

---

## 🎨 1. Wireframes / Design

### Structuur & Navigatie

Het prototype bestaat uit vijf hoofdpagina's:

1. **index.html** - Homepage met productverhaal, hero-sectie en productoverzicht
2. **checkout.html** - Bestelpagina met formulier en besteloverzicht
3. **game.html** - Embedded game-pagina ("Vang de Eierbal")
4. **contact.html** - Contactinformatie en formulier
5. **adminpanel.html** - Demo-beheerpaneel voor bestellingen

### Navigatiestructuur

- Herbruikbare header/footer via component systeem (`components/navbar.html` en `components/footer.html`)
- Navigatie bestaat uit: Shop, Verhaal, Contact, Spel
- Consistent over alle pagina's heen
- Responsive hamburger-menu voor mobiel (nog te implementeren)

### Gebruikerservaring (UX)

- **Homepage**: Directe focus op het product met visuele kerstbal en duidelijke call-to-actions
- **Checkout**: Eenvoudig bestelformulier met visueel besteloverzicht
- **Game**: Embedded spel voor engagement en speelse interactie
- **Contact**: Laagdrempelig contactformulier
- **Admin**: Overzichtelijk bestellingenbeheer voor de opdrachtgever

### Gameflow

De game is geïntegreerd als embedded itch.io iframe:
- Toegankelijk via navigatiemenu ("Spel")
- Volledig speelbaar binnen de website
- Consistent gestyled met dezelfde header/footer als de rest van de site
- Responsive iframe die schaalt met schermgrootte

---

## 🎨 2. Stijl bepalen

### Kleurenpalet

Het prototype gebruikt een feestelijk, natuurlijk kleurenschema dat past bij het kerst- en duurzaamheidsthema:

```css
--color-festive-green: #0f5132  /* Donkergroen voor primaire elementen */
--color-accent: #0e4328          /* Nog donkerder groen voor accenten */
--color-muted: #6b6b6b           /* Grijs voor subtekst */
--color-gold: #b58800            /* Goud voor decoratieve elementen (kerstbal ring) */
```

### Typografie

- **Koppen**: Playfair Display (serif) - elegant en feestelijk
- **Body**: Montserrat (sans-serif) - modern en goed leesbaar
- **Gewichten**: 300 (light), 500 (regular), 700 (bold)

### Visuele Stijl

- **Kerstsfeer**: Subtiele sneeuwvlokken animaties, warme achtergrondkleuren
- **Natuurlijk**: Zachte tinten, organische vormen (ronde kerstballen)
- **Modern**: Clean layout met veel witruimte, glasmorphism effecten (backdrop-blur)
- **Ambachtelijk**: Handgemaakt gevoel door productfoto's en persoonlijke teksten

### Iconen & Elementen

- Emoji's voor speelse touch (🎁, ❄️)
- Custom CSS kerstbal met metallic "bauble-cap" en gouden ring
- Schaduwen en gradients voor diepte
- Rounded corners (border-radius) voor vriendelijke uitstraling

### Tone of Voice

- **Warm & toegankelijk**: "Een kerstbal die groeit", "Alle winst naar Jeugdbonds Sport"
- **Lokaal & ambachtelijk**: "Handgemaakt in Sappemeer-Oost", "lokale zaden"
- **Duurzaam & betekenisvol**: "plantbaar", "biodiversiteit", "met betekenis"
- **Informeel maar professioneel**: Je/jij-vorm in teksten

---

## 🛠️ 3. Prototype bouwen

### Must-haves (✅ Compleet)

#### ✅ Gebruiksvriendelijke webshop
- Duidelijke productpagina met prijs (€12,00)
- Visuele productfoto's en beschrijving
- "Nu bestellen" button met directe link naar checkout

#### ✅ Informatie over goed doel
- Prominente badge: "Alle winst naar Jeugdbonds Sport"
- Uitleg in hero-sectie en footer
- Consistent gecommuniceerd over alle pagina's

#### ✅ Contactinformatie
- Dedicated contactpagina met formulier
- Contactgegevens (nog in te vullen door opdrachtgever)

#### ✅ Kerstthema
- Kerstbanner achtergrond (`kerstbanner.avif`)
- Sneeuwvlokken animaties
- Gouden kerstbal decoraties
- Feestelijke kleuren en typografie

#### ✅ Verzendkosteninformatie
- Vermeld in checkout-pagina
- Duidelijk totaalbedrag inclusief verzendkosten

### Nice-to-haves (✅ Compleet)

#### ✅ Game-integratie
- Embedded itch.io game: "Vang de Eierbal"
- Volledig speelbaar binnen website
- Geoptimaliseerde iframe sizing (1000x680px)
- Consistente styling met header/footer

### Technische Implementatie

#### Frontend Framework
- **Tailwind CSS v4** via CDN voor utility-first styling
- Custom CSS in `style.css` voor complexe componenten (kerstballen, animaties)
- `@theme` directive voor custom color tokens

#### Component Systeem
- Herbruikbare navbar/footer via JavaScript fetch API
- `js/components.js` laadt componenten dynamisch
- Scheiding van concerns: HTML templates in `components/` folder

#### Backend (Demo)
- Node.js + Express server in `backend/` folder
- JSON file-based order storage (`orders.json`)
- REST API endpoints: GET/POST/PATCH/DELETE/clear
- LocalStorage fallback voor offline functionaliteit

#### Responsive Design
- Mobile-first approach met Tailwind breakpoints
- Flexbox/Grid voor layouts
- Responsive iframes en images
- Geoptimaliseerd voor desktop, tablet en mobile

#### Animaties
- CSS keyframe animaties voor sneeuwvlokken
- Smooth transitions op buttons (hover states)
- Prefers-reduced-motion support voor toegankelijkheid

---

## 📝 4. Documentatie

### Ontwerp- en Spelkeuzes

#### Waarom deze visuele stijl?
- **Kerst + Natuur**: De combinatie van donkergroen, goud en sneeuw creëert een feestelijke maar natuurlijke sfeer die past bij het duurzaamheidsaspect
- **Minimalisme**: Veel witruimte en clean design zorgen dat het product centraal staat
- **Warmte**: Zachte gradients en schaduwen maken het vriendelijk en toegankelijk

#### Waarom component-based architecture?
- **Schaalbaarheid**: Makkelijk om nieuwe pagina's toe te voegen zonder code te dupliceren
- **Onderhoud**: Wijzigingen in navbar/footer hoeven maar op één plek
- **Professionaliteit**: Moderne best practice voor webdevelopment

#### Waarom embedded game?
- **Engagement**: Houdt bezoekers langer op de site
- **Merkbeleving**: Versterkt het speelse, lokale karakter
- **Laagdrempelig**: Geen downloads nodig, direct speelbaar
- **Thematisch**: "Vang de Eierbal" sluit aan bij het product

#### Waarom Tailwind CSS?
- **Snelheid**: Rapid prototyping zonder veel custom CSS te schrijven
- **Consistentie**: Voorgedefinieerde spacing, colors, typography
- **Responsive**: Built-in breakpoints en responsive utilities
- **Modern**: Industry standard voor moderne webdevelopment

#### Waarom JSON backend i.p.v. database?
- **Simpliciteit**: Geen database setup nodig voor prototype
- **Portabiliteit**: Gemakkelijk te deployen en te testen
- **Transparantie**: Orders zijn leesbaar in plain text JSON
- **Voldoende**: Voor prototype/demo-doeleinden meer dan genoeg

### Design Assets Locatie

Alle design assets bevinden zich in de volgende mappen:
- `/design` - Originele designs en bronbestanden (Figma, logo's)
- `/prototype/Images` - Geoptimaliseerde afbeeldingen voor web (productfoto's, banner)
- `/prototype/components` - Herbruikbare HTML componenten
- `/prototype/style.css` - Custom styling en Tailwind theme configuratie

### Wireframes

Wireframes zijn te vinden in de `/design` folder:
- `Kleierbal.fig` - Figma wireframes/designs

---

## ✅ Checklist Must-haves

- [x] Gebruiksvriendelijke webshop om de kleierbal te kunnen kopen
- [x] Informatie over waar het geld heen gaat (goed doel)
- [x] Contactinformatie
- [x] Kerstthema op de webshop
- [x] Informatie over verzendkosten

## ✅ Checklist Nice-to-haves

- [x] Een kleine game (embedded itch.io game)

---

## 🚀 Toekomstige Uitbreidingen

### Korte termijn
- **Betaling integratie**: Koppeling met Mollie/Stripe voor echte betalingen
- **Email confirmatie**: Automatische orderbevestigingen
- **Admin authenticatie**: Login systeem voor beheerpaneel
- **Voorraad management**: Stock tracking per product

### Lange termijn
- **Meerdere producten**: Uitbreiding productcatalogus
- **Customer accounts**: Inloggen en orderhistorie
- **Reviews systeem**: Klantbeoordelingen en foto's
- **Multi-language**: Engels/Duits naast Nederlands
- **Analytics**: Tracking van conversies en gebruikersgedrag

---

## 📦 Project Structuur

```
prototype/
├── index.html              # Homepage
├── checkout.html           # Bestelpagina
├── game.html              # Embedded game pagina
├── contact.html           # Contactpagina
├── adminpanel.html        # Beheerpaneel
├── style.css              # Custom styling
├── components/
│   ├── navbar.html        # Herbruikbare header
│   └── footer.html        # Herbruikbare footer
├── js/
│   └── components.js      # Component loader
├── Images/
│   ├── Kleierbal.jpg      # Productfoto
│   ├── eierballogo.png    # Logo
│   └── kerstbanner.avif   # Achtergrond banner
└── backend/
    ├── server.js          # Express API
    ├── orders.json        # Order opslag
    ├── package.json       # Dependencies
    └── README.md          # Backend documentatie
```

---

## 👥 Team & Rolverdeling

Dit prototype is gemaakt door een team van vier personen met de volgende taakverdeling:
- **Frontend Development**: HTML/CSS/JavaScript implementatie
- **Design**: Visuele stijl, kleuren, typografie
- **Backend**: Server setup en API endpoints
- **Game Integration**: Embedding en optimalisatie van het spel

*(Specifieke namen en rollen kunnen hier worden toegevoegd)*

---

## 📅 Tijdlijn

Het prototype is ontwikkeld in **4 dagen** volgens de volgende planning:
- **Dag 1**: Wireframing, design system, setup
- **Dag 2**: Frontend development (homepage, checkout)
- **Dag 3**: Backend development, game integratie
- **Dag 4**: Refinement, testing, documentatie

---

## 🔗 Links & Resources

- **Live Prototype**: *(URL van gehoste versie)*
- **GitHub Repository**: https://github.com/Rickkert24/deepdive-kleierbal
- **Design Files**: `/design` folder in repo
- **Backend API**: Draait lokaal op `http://localhost:3000`
- **Game**: https://rickkert.itch.io/vang-de-eierbal

---

*Laatst bijgewerkt: November 2025*
