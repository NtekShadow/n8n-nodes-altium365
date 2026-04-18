# AI Agent Tools - Altium 365 Integration

Dieses Dokument beschreibt die verfügbaren Tools für AI Agents in der n8n Altium 365 Integration.

## Übersicht

Die Altium 365 Nodes bieten strukturierte APIs für:
- Projektmanagement
- Dateiexporte (Gerber, PCB, etc.)
- Fertigungspaket-Erstellung
- Ereignis-Trigger für Commits und neue Projekte

**✅ AI Agent Kompatibilität**: Die Action-Nodes sind mit `usableAsTool: true` konfiguriert und können von AI Modellen wie Gemini, GPT-4, Claude, etc. als Tools verwendet werden.

## Verfügbare Tools

### Altium365 (Action Node)

#### Projekt-Tools

**Projekt abrufen**
- **Beschreibung**: Ruft vollständige Details eines spezifischen Projekts ab
- **Input**: projectId (Grid-ID des Projekts)
- **Output**: Vollständiges Projekt-Objekt mit allen Metadaten
- **Verwendung**: Für detaillierte Projektanalysen

**Projekt abrufen (vereinfacht)**
- **Beschreibung**: Ruft grundlegende Projektinformationen ab
- **Input**: projectId (Grid-ID des Projekts)
- **Output**:
  ```json
  {
    "success": true,
    "data": {
      "id": "grid:...",
      "projectId": "PRJ-001",
      "name": "Projekt Name",
      "description": "Projekt Beschreibung",
      "projectType": "PCB",
      "createdAt": "2026-01-01T...",
      "updatedAt": "2026-04-18T...",
      "url": "https://...",
      "workspaceUrl": "https://...",
      "variantCount": 2
    },
    "operation": "getSimplified",
    "timestamp": "2026-04-18T..."
  }
  ```
- **Verwendung**: Für schnelle Projektübersichten

**Projekte auflisten**
- **Beschreibung**: Ruft eine Liste von Projekten ab
- **Input**: limit (optional), returnAll (boolean)
- **Output**: Array von Projekt-Objekten
- **Verwendung**: Für Projekt-Inventur

**Letzten Commit abrufen**
- **Beschreibung**: Holt den neuesten Commit eines Projekts
- **Input**: projectId
- **Output**: Commit-Details mit Dateiänderungen
- **Verwendung**: Für Versionskontrolle

#### Export-Tools

**Projektdateien exportieren**
- **Beschreibung**: Exportiert PCB-Dateien (Gerber, IDF, NC Drill, etc.)
- **Input**: projectId, exportType, variantName (optional), revisionId (optional)
- **Output**: Download-URL für exportierte Dateien
- **Verwendung**: Für Fertigungsvorbereitung

**Fertigungspaket erstellen**
- **Beschreibung**: Erstellt und teilt Fertigungspakete
- **Input**: projectId, packageName, shareWithEmails, description (optional)
- **Output**: Paket-ID und Download-URL
- **Verwendung**: Für Hersteller-Kommunikation

### Altium365Trigger (Trigger Node)

**Projekt committet**
- **Beschreibung**: Löst bei Git-Commits in Projekten aus
- **Konfiguration**: projectId (optional, alle wenn leer), includeFileChanges
- **Output**: Commit-Details mit geänderten Dateien
- **Verwendung**: Für CI/CD Pipelines

**Neues Projekt**
- **Beschreibung**: Löst bei neuen Projekten aus
- **Output**: Projekt-Details
- **Verwendung**: Für Projekt-Tracking

**Komponente aktualisiert**
- **Beschreibung**: Löst bei Änderungen an Bibliothekskomponenten aus
- **Output**: Komponenten-Details
- **Verwendung**: Für Design Rule Checks

## Output-Format

Alle Tools geben strukturierte JSON-Antworten zurück:

### Erfolgreiche Operationen
```json
{
  "success": true,
  "data": { /* Tool-spezifische Daten */ },
  "operation": "operationName",
  "timestamp": "ISO-8601-Timestamp"
}
```

### Fehler
```json
{
  "success": false,
  "error": {
    "message": "Fehlermeldung",
    "type": "ErrorType",
    "timestamp": "ISO-8601-Timestamp",
    "operation": "operationName",
    "resource": "resourceName"
  }
}
```

## Best Practices für AI Agents

1. **Fehlerbehandlung**: Prüfen Sie immer `success` Feld zuerst
2. **Typisierung**: Verwenden Sie die vereinfachten Operationen für vorhersehbare Strukturen
3. **Polling**: Verwenden Sie Trigger für ereignisbasierte Workflows statt kontinuierliches Polling
4. **Async Operationen**: Nutzen Sie callbackUrl für langlaufende Exporte
5. **Ressourcen-Limits**: Setzen Sie angemessene Limits für Listen-Operationen

## Beispiele

### Projekt-Status prüfen
```
1. "Projekt abrufen (vereinfacht)" mit projectId
2. Prüfen ob status === "ACTIVE"
3. Bei Bedarf "Letzten Commit abrufen" für Versionsinfo
```

### Fertigung vorbereiten
```
1. "Projektdateien exportieren" mit exportType: "Gerber"
2. Download-URL aus Response extrahieren
3. "Fertigungspaket erstellen" mit Hersteller-E-Mails
```

### CI/CD Pipeline
```
1. Trigger "Projekt committet" einrichten
2. Bei Commit "Projektdateien exportieren"
3. Exportierte Dateien an Fertigung senden
```