import os
import numpy as np
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, precision_score, recall_score, roc_auc_score
import joblib

# Paths for saved models
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_PATH = os.path.join(MODEL_DIR, "model.joblib")
SCALER_PATH = os.path.join(MODEL_DIR, "scaler.joblib")
STATS_PATH = os.path.join(MODEL_DIR, "stats.joblib")

def calculate_cosine_similarity(resume_cleaned_texts: list[str], jd_cleaned_text: str) -> list[float]:
    """Calculates TF-IDF cosine similarity between a list of resumes and a job description."""
    if not resume_cleaned_texts or not jd_cleaned_text:
        return [0.0] * len(resume_cleaned_texts)
    
    # We fit the vectorizer on all texts combined
    texts = [jd_cleaned_text] + resume_cleaned_texts
    vectorizer = TfidfVectorizer(stop_words='english')
    try:
        tfidf_matrix = vectorizer.fit_transform(texts)
        # First row is the job description
        jd_vector = tfidf_matrix[0:1]
        # Rest of the rows are the resumes
        resume_vectors = tfidf_matrix[1:]
        
        # Calculate cosine similarities
        similarities = cosine_similarity(resume_vectors, jd_vector).flatten()
        return [float(val) for val in similarities]
    except Exception as e:
        print(f"Error calculating cosine similarity: {e}")
        return [0.0] * len(resume_cleaned_texts)

def generate_synthetic_data(num_samples: int = 500) -> pd.DataFrame:
    """
    Generates a realistic synthetic dataset representing HR shortlisting decisions.
    Features:
    - cosine_similarity: text relevance (TF-IDF)
    - skills_match_ratio: overlap with required skills
    - experience_ratio: years of experience relative to job requirement
    - education_match: whether candidate meets or exceeds education requirement
    """
    np.random.seed(42)
    
    # Generate independent features
    cosine_sim = np.random.uniform(0.15, 0.85, num_samples)
    skills_match = np.random.uniform(0.1, 0.9, num_samples)
    # Ratio of candidate's experience to required experience (capped at 2.0)
    exp_ratio = np.random.uniform(0.0, 2.0, num_samples)
    # Binary: whether candidate's education matches/exceeds requirement
    edu_match = np.random.binomial(1, 0.65, num_samples)
    
    # Define a logistic function with realistic weights
    # Intercept is negative because shortlisting is generally competitive (fewer than 50% shortlisted)
    # logit = b0 + b1*cosine_sim + b2*skills_match + b3*exp_ratio + b4*edu_match + noise
    logit = -4.5 + 4.0 * cosine_sim + 3.5 * skills_match + 2.0 * exp_ratio + 1.5 * edu_match
    # Add noise to represent unmeasured characteristics (interviews, soft skills in text, etc.)
    noise = np.random.normal(0, 0.75, num_samples)
    logit_with_noise = logit + noise
    
    # Calculate probability of shortlisting using sigmoid
    probability = 1 / (1 + np.exp(-logit_with_noise))
    # Threshold at 0.5 to get binary outcomes
    shortlisted = (probability >= 0.5).astype(int)
    
    df = pd.DataFrame({
        "cosine_similarity": cosine_sim,
        "skills_match_ratio": skills_match,
        "experience_ratio": exp_ratio,
        "education_match": edu_match,
        "shortlisted": shortlisted
    })
    
    return df

def train_classifier() -> dict:
    """Trains the Logistic Regression classifier on synthetic HR data and saves the model."""
    df = generate_synthetic_data(500)
    
    X = df[["cosine_similarity", "skills_match_ratio", "experience_ratio", "education_match"]]
    y = df["shortlisted"]
    
    # Split into train/test
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42, stratify=y)
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Train model (using L2 regularization, default)
    # We want high precision for shortlisting (reducing false positives)
    model = LogisticRegression(class_weight='balanced', random_state=42)
    model.fit(X_train_scaled, y_train)
    
    # Predictions
    y_pred = model.predict(X_test_scaled)
    y_prob = model.predict_proba(X_test_scaled)[:, 1]
    
    # Metrics
    acc = accuracy_score(y_test, y_pred)
    prec = precision_score(y_test, y_pred, zero_division=0)
    rec = recall_score(y_test, y_pred, zero_division=0)
    auc = roc_auc_score(y_test, y_prob)
    
    # Save the models
    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    
    # Save training metadata
    stats = {
        "accuracy": float(acc),
        "precision": float(prec),
        "recall": float(rec),
        "auc": float(auc),
        "coefficients": {
            "cosine_similarity": float(model.coef_[0][0]),
            "skills_match_ratio": float(model.coef_[0][1]),
            "experience_ratio": float(model.coef_[0][2]),
            "education_match": float(model.coef_[0][3])
        },
        "intercept": float(model.intercept_[0]),
        "samples_count": len(df)
    }
    joblib.dump(stats, STATS_PATH)
    
    print(f"Model trained successfully. Test Accuracy: {acc:.4f}, Precision: {prec:.4f}, Recall: {rec:.4f}, AUC: {auc:.4f}")
    return stats

def get_model_stats() -> dict:
    """Loads and returns training statistics, training a new model if none exists."""
    if not os.path.exists(MODEL_PATH) or not os.path.exists(SCALER_PATH) or not os.path.exists(STATS_PATH):
        return train_classifier()
    try:
        return joblib.load(STATS_PATH)
    except Exception:
        return train_classifier()

def predict_shortlist_probability(features_list: list[dict]) -> list[dict]:
    """
    Predicts the shortlisting probability for a list of resume feature dictionaries.
    Each feature dictionary should contain:
    - cosine_similarity: float
    - skills_match_ratio: float
    - experience_ratio: float
    - education_match: float (1.0 or 0.0)
    """
    if not features_list:
        return []
        
    # Load model and scaler
    if not os.path.exists(MODEL_PATH) or not os.path.exists(SCALER_PATH):
        train_classifier()
        
    model = joblib.load(MODEL_PATH)
    scaler = joblib.load(SCALER_PATH)
    
    # Convert feature list to numpy matrix
    X_list = []
    for f in features_list:
        X_list.append([
            f.get("cosine_similarity", 0.0),
            f.get("skills_match_ratio", 0.0),
            f.get("experience_ratio", 1.0),
            f.get("education_match", 1.0)
        ])
    
    X = np.array(X_list)
    X_scaled = scaler.transform(X)
    
    probabilities = model.predict_proba(X_scaled)[:, 1]
    predictions = model.predict(X_scaled)
    
    results = []
    for i, prob in enumerate(probabilities):
        results.append({
            "shortlist_probability": float(prob),
            "shortlist_predicted": int(predictions[i])
        })
        
    return results

if __name__ == "__main__":
    # If run directly, train the model and display metrics
    train_classifier()
