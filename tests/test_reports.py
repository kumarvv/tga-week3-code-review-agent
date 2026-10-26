import io

import pytest
from docx import Document
from fastapi.testclient import TestClient

from backend import main


@pytest.mark.parametrize('partial', [False, True])
def test_word_download(monkeypatch, partial):
    report = {
        'source': 'source.zip', 'summary': 'Check input validation.',
        'notice': 'Validate findings before applying changes.',
        'scope': {'files_reviewed': 1, 'skipped': [{'path': 'image.png', 'reason': 'Binary file'}]},
        'incomplete': partial, 'synthesis_fallback': partial,
        'findings': [{'severity': 'high', 'title': 'Unchecked input', 'category': 'security',
                      'file': 'app.py', 'line': 1, 'explanation': 'Input is untrusted.',
                      'recommendation': 'Validate <input> & reject invalid values.'}],
        'agents': [{'agent': 'security', 'summary': 'One issue found.'}],
    }
    job = main.Job(source='source.zip', status='complete', report=report)
    monkeypatch.setitem(main.jobs, 'word-test', job)
    with TestClient(main.app) as client:
        response = client.get('/api/reviews/word-test/report?format=docx')
    assert response.status_code == 200
    assert response.headers['content-type'] == 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    assert 'filename="review.docx"' in response.headers['content-disposition']
    document = Document(io.BytesIO(response.content))
    text = '\n'.join(p.text for p in document.paragraphs)
    for expected in ('CodeScanner', 'source.zip', report['summary'], report['notice'],
                     'app.py:1', report['findings'][0]['recommendation'],
                     'One issue found.', 'image.png: Binary file'):
        assert expected in text
    assert ('Partial review' in text) == partial
    assert ('AI synthesis was unavailable' in text) == partial
