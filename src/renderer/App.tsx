import { MemoryRouter as Router, Routes, Route } from 'react-router-dom';
import './App.css';

function Hello() {
  return (
    <div className="container">
      <h1>YouTube Downloader</h1>
      <form className="download-form">
        <div className="form-group">
          <label htmlFor="youtube-link">
            Link do YouTube:
            <input
              type="url"
              id="youtube-link"
              name="youtube-link"
              placeholder="Cole o link do YouTube aqui..."
              required
            />
          </label>
        </div>

        <div className="form-group">
          <label htmlFor="download-path">
            Pasta de Download:
            <input
              type="text"
              id="download-path"
              name="download-path"
              placeholder="Selecione a pasta de destino..."
              readOnly
              required
            />
          </label>
          <button type="button" className="browse-btn">
            Procurar
          </button>
        </div>

        <div className="form-group">
          <label htmlFor="format">
            Formato:
            <select id="format" name="format" required>
              <option value="">Selecione o formato</option>
              <option value="mp3">MP3 (Áudio)</option>
              <option value="mp4">MP4 (Vídeo)</option>
            </select>
          </label>
        </div>

        <button type="submit" className="download-btn">
          Baixar
        </button>
      </form>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Hello />} />
      </Routes>
    </Router>
  );
}
