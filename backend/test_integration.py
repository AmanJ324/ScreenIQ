import os
import sys
import requests

# Set endpoint
BASE_URL = "http://localhost:8000"

def run_integration_tests():
    print("=== Running Integration Tests for ScreenIQ ===")
    
    # 1. Test GET /api/model-stats
    print("\nTesting GET /api/model-stats...")
    try:
        r = requests.get(f"{BASE_URL}/api/model-stats")
        if r.status_code == 200:
            data = r.json()
            print("SUCCESS! Model Stats:")
            print(f"  Accuracy: {data.get('accuracy'):.4f}")
            print(f"  Precision: {data.get('precision'):.4f}")
            print(f"  Recall: {data.get('recall'):.4f}")
            print(f"  ROC-AUC: {data.get('auc'):.4f}")
            print(f"  Samples: {data.get('samples_count')}")
            print(f"  Coefficients: {data.get('coefficients')}")
        else:
            print(f"FAILED: Status Code {r.status_code}, Response: {r.text}")
            sys.exit(1)
    except Exception as e:
        print(f"FAILED: Connection error: {e}")
        sys.exit(1)
        
    # 2. Test POST /api/rank
    print("\nTesting POST /api/rank with mock resumes...")
    
    # Check if mock resumes exist
    resumes_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test_resumes")
    resume_files = ["alex_jones.txt", "john_doe.txt", "jane_smith.txt"]
    files = []
    
    for filename in resume_files:
        path = os.path.join(resumes_dir, filename)
        if not os.path.exists(path):
            print(f"FAILED: Mock resume not found at {path}")
            sys.exit(1)
        files.append(('resumes', (filename, open(path, 'rb'), 'text/plain')))
        
    form_data = {
        'job_description': 'We are looking for a Senior Machine Learning Scientist with expertise in Python, NLP, Scikit-learn, and PyTorch. The ideal candidate has 5+ years of experience and a PhD or Master\'s degree.',
        'min_experience': '5.0',
        'required_skills': 'Python, NLP, Scikit-learn, PyTorch',
        'required_education': 'Master'
    }
    
    try:
        r = requests.post(f"{BASE_URL}/api/rank", data=form_data, files=files)
        
        # Clean up opened files
        for name, file_info in files:
            file_info[1].close()
            
        if r.status_code == 200:
            data = r.json()
            print("SUCCESS! Rank Results:")
            rankings = data.get("rankings", [])
            for idx, candidate in enumerate(rankings):
                print(f"  Rank #{idx+1}: {candidate.get('filename')}")
                print(f"    TF-IDF Similarity: {candidate.get('cosine_similarity'):.4f}")
                print(f"    Shortlist Prob: {candidate.get('shortlist_probability'):.4f}")
                print(f"    Shortlisted: {candidate.get('shortlist_predicted')}")
                print(f"    Years Exp: {candidate.get('experience_years')}")
                print(f"    Edu: {candidate.get('education_level')}")
                print(f"    Matched Skills: {candidate.get('skills_matched')}")
                print(f"    Missing Skills: {candidate.get('skills_missing')}")
                
            # Verify correct ranking order: Alex Jones should be #1
            if len(rankings) > 0 and rankings[0].get("filename") == "alex_jones.txt":
                print("\nRankings order verification: PASSED (Alex Jones ranked #1)")
            else:
                print("\nRankings order verification: FAILED (Alex Jones should be #1)")
                sys.exit(1)
        else:
            print(f"FAILED: Status Code {r.status_code}, Response: {r.text}")
            sys.exit(1)
    except Exception as e:
        print(f"FAILED: Connection error: {e}")
        sys.exit(1)
        
    # 3. Test POST /api/train
    print("\nTesting POST /api/train (retraining)...")
    try:
        r = requests.post(f"{BASE_URL}/api/train")
        if r.status_code == 200:
            data = r.json()
            print("SUCCESS! Retrained metrics:")
            print(f"  New Accuracy: {data.get('stats', {}).get('accuracy'):.4f}")
            print(f"  New Precision: {data.get('stats', {}).get('precision'):.4f}")
        else:
            print(f"FAILED: Status Code {r.status_code}, Response: {r.text}")
            sys.exit(1)
    except Exception as e:
        print(f"FAILED: Connection error: {e}")
        sys.exit(1)
        
    print("\n=== ALL INTEGRATION TESTS PASSED SUCCESSFULLY ===")

if __name__ == "__main__":
    run_integration_tests()
