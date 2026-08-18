import os
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

# Import parser and ML modules
from app.parser import parse_resume, EDUCATION_LEVELS, extract_skills, clean_text
from app.ml import calculate_cosine_similarity, predict_shortlist_probability, get_model_stats, train_classifier

app = FastAPI(
    title="AI-Powered Resume Screener & Job Match Ranker",
    description="Parser and ranker using TF-IDF similarity and Logistic Regression candidate shortlisting prediction."
)

# Enable CORS for local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Endpoint for model statistics
@app.get("/api/model-stats")
def model_stats():
    """Returns the coefficients, accuracy, and training metrics of the Logistic Regression model."""
    try:
        stats = get_model_stats()
        return stats
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get model stats: {str(e)}")

# Endpoint to trigger retraining of the model
@app.post("/api/train")
def retrain_model():
    """Forces retraining of the Logistic Regression classifier on synthetic/HR data."""
    try:
        stats = train_classifier()
        return {"message": "Model retrained successfully", "stats": stats}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrain model: {str(e)}")

# Main ranking endpoint
@app.post("/api/rank")
async def rank_resumes(
    job_description: str = Form(...),
    min_experience: float = Form(0.0),
    required_skills: str = Form(""),  # Comma-separated list
    required_education: str = Form("Bachelor"),
    resumes: List[UploadFile] = File(...)
):
    """
    Parses a set of resumes against a job description.
    Computes cosine similarity, skill matching, and predicts shortlisting probability.
    """
    if not resumes:
        raise HTTPException(status_code=400, detail="No resumes uploaded")
        
    try:
        # 1. Parse job description constraints
        custom_skills = [s.strip().lower() for s in required_skills.split(",") if s.strip()]
        jd_cleaned = clean_text(job_description)
        
        # Get target skills from Job Description + custom input
        jd_extracted_skills = extract_skills(job_description, custom_skills)
        target_skills = list(set(jd_extracted_skills + custom_skills))
        
        # Target education rank
        req_edu_lc = required_education.lower().strip()
        required_edu_rank = EDUCATION_LEVELS.get(req_edu_lc, 2) # Default to Bachelor (rank 2)
        
        # 2. Parse all resumes
        parsed_resumes = []
        for file in resumes:
            file_bytes = await file.read()
            parsed = parse_resume(file_bytes, file.filename, target_skills)
            parsed_resumes.append(parsed)
            
        # 3. Calculate batch Cosine Similarity using TF-IDF
        cleaned_resume_texts = [r["cleaned_text"] for r in parsed_resumes]
        similarities = calculate_cosine_similarity(cleaned_resume_texts, jd_cleaned)
        
        # 4. Prepare feature vectors for Logistic Regression classifier
        features_list = []
        for i, resume in enumerate(parsed_resumes):
            # Cosine similarity
            cosine_sim = similarities[i]
            
            # Skills match ratio
            resume_skills_set = set(resume["skills"])
            target_skills_set = set(target_skills)
            skills_overlap = resume_skills_set.intersection(target_skills_set)
            skills_ratio = len(skills_overlap) / max(1, len(target_skills_set))
            
            # Experience ratio: ratio of years of experience to required (capped at 2.0)
            candidate_exp = resume["experience"]
            if min_experience > 0:
                exp_ratio = min(candidate_exp / min_experience, 2.0)
            else:
                exp_ratio = 1.0 # If no experience requirement, candidate meets it
                
            # Education match: 1.0 if candidate rank >= required, else ratio
            candidate_edu_rank = resume["education_rank"]
            if candidate_edu_rank >= required_edu_rank:
                edu_match = 1.0
            else:
                edu_match = float(candidate_edu_rank) / max(1, required_edu_rank)
                
            features_list.append({
                "cosine_similarity": cosine_sim,
                "skills_match_ratio": skills_ratio,
                "experience_ratio": exp_ratio,
                "education_match": edu_match,
                
                # Keep reference to index for updating
                "_index": i,
                "_skills_overlap": list(skills_overlap),
                "_skills_missing": list(target_skills_set - resume_skills_set)
            })
            
        # 5. Predict shortlisting probabilities using Logistic Regression
        predictions = predict_shortlist_probability(features_list)
        
        # 6. Build response objects
        results = []
        for i, feat in enumerate(features_list):
            pred = predictions[i]
            resume = parsed_resumes[i]
            
            results.append({
                "filename": resume["filename"],
                "experience_years": resume["experience"],
                "education_level": resume["education_level"],
                "skills_found": resume["skills"],
                "skills_matched": feat["_skills_overlap"],
                "skills_missing": feat["_skills_missing"],
                "cosine_similarity": feat["cosine_similarity"],
                "shortlist_probability": pred["shortlist_probability"],
                "shortlist_predicted": pred["shortlist_predicted"],
                # Return snippet of resume (first 500 chars)
                "text_preview": resume["raw_text"][:500] + ("..." if len(resume["raw_text"]) > 500 else "")
            })
            
        # Sort results by shortlisting probability descending
        results.sort(key=lambda x: x["shortlist_probability"], reverse=True)
        
        return {
            "job_metrics": {
                "target_skills": target_skills,
                "min_experience": min_experience,
                "required_education": required_education,
                "total_resumes": len(resumes)
            },
            "rankings": results
        }
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Error ranking resumes: {str(e)}")

# Mount static files to serve the frontend web application
# Note: In production, Docker will serve static assets from this folder
static_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "static")
if os.path.exists(static_dir):
    app.mount("/", StaticFiles(directory=static_dir, html=True), name="static")
else:
    print(f"Warning: Static files directory not found at {static_dir}. Static webapp will not be hosted.")
